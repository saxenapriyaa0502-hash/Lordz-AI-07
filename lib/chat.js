// Core chat logic - shared by Vercel (api/chat.js) and local server (server.js)
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"];
const MAX_PROMPT_CHARS = 30000;
const MAX_HISTORY = 20;
const MAX_TOKENS = 2048;
const RATE_LIMIT = 20;        // requests
const RATE_WINDOW_MS = 60000; // per minute, per IP

const SYSTEM_PROMPT = `You are LORDZ AI, a smart, friendly and helpful AI assistant created by Swastik Saxena.
- Reply in the same language the user writes in (English, Hindi, Hinglish, etc.).
- Be clear and concise. Use short paragraphs; use code blocks for code.
- If you don't know something, say so honestly instead of guessing.
- Refuse harmful or illegal requests politely.`;

// Simple in-memory rate limiter (best-effort on serverless)
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

// Validate + normalise history so roles alternate and start with "user"
function buildMessages(history, prompt) {
  const raw = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
  const msgs = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    const content = m.content.slice(0, MAX_PROMPT_CHARS);
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += "\n" + content;
    else msgs.push({ role: m.role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user") last.content += "\n" + prompt;
  else msgs.push({ role: "user", content: prompt });
  return msgs;
}

const OK_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
function cleanFiles(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  let total = 0;
  for (const f of list.slice(0, 4)) {
    if (!f || !OK_MIME.includes(f.mime) || typeof f.data !== "string") continue;
    total += f.data.length;
    if (total > 3800000) break;
    out.push({ mime: f.mime, data: f.data });
  }
  return out;
}

async function handleChat(body, ip = "unknown") {
  const keys = [process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "", process.env.GEMINI_API_KEY_2 || ""].filter(Boolean);
  if (!keys.length) return { status: 500, json: { error: "Server is not configured (missing API key)." } };

  if (isRateLimited(ip)) return { status: 429, json: { error: "Too many requests. Please wait a minute." } };

  const files = cleanFiles(body?.attachments);
  const nowStr = typeof body?.now === "string" ? body.now.slice(0, 100) : "";
  let prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt && files.length) prompt = "Please look at the attached file(s) and help me.";
  if (!prompt) return { status: 400, json: { error: "Message is empty." } };
  if (prompt.length > MAX_PROMPT_CHARS)
    return { status: 400, json: { error: `Message too long (max ${MAX_PROMPT_CHARS} characters).` } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const messages = buildMessages(body.history, prompt);
    const base = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT + (nowStr ? "\nThe user's current local date and time is: " + nowStr + ". Use it when asked about today's date, the day or the time." : "") }] },
      contents: messages.map((m, i) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }].concat(
          i === messages.length - 1 ? files.map((f) => ({ inline_data: { mime_type: f.mime, data: f.data } })) : []
        ),
      })),
    };

    let data = null;
    let lastStatus = 0;
    const started = Date.now();
    outer: for (const apiKey of keys) {
    for (const model of MODELS) {
      // first try with thinking switched off (much faster); if the model rejects that (400), retry normally
      for (const fast of [true, false]) {
        const ctl = new AbortController();
        const tm = setTimeout(() => ctl.abort(), 20000);
        try {
          const cfg = fast ? { maxOutputTokens: MAX_TOKENS, thinkingConfig: { thinkingBudget: 0 } } : { maxOutputTokens: MAX_TOKENS };
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            signal: ctl.signal,
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(Object.assign({}, base, { generationConfig: cfg })),
          });
          if (res.ok) { data = await res.json(); break; }
          lastStatus = res.status;
          console.error("Gemini error:", model, res.status, (await res.text()).slice(0, 300));
          if (res.status === 503) await new Promise((r) => setTimeout(r, 800));
          if (res.status !== 400) break;
        } catch (e) {
          lastStatus = 504;
          console.error("Gemini request failed:", model, e.name);
          break;
        } finally {
          clearTimeout(tm);
        }
      }
      if (data) break outer;
      if (Date.now() - started > 40000) break outer;
    }
    }
    if (!data) {
      return lastStatus === 429
        ? { status: 429, json: { error: "AI is busy right now (free limit reached). Please wait a minute and try again." } }
        : { status: 502, json: { error: "AI service is unavailable right now. Try again." } };
    }
    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    if (!reply) return { status: 502, json: { error: "AI returned an empty response." } };
    return { status: 200, json: { reply } };
  } catch (err) {
    console.error("Chat error:", err.name === "AbortError" ? "timeout" : err);
    return { status: 504, json: { error: "Request timed out. Please try again." } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { handleChat };
                                                                        
