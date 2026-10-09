// Core chat logic - shared by Vercel (api/chat.js) and local server (server.js)
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_PROMPT_CHARS = 4000;
const MAX_HISTORY = 20;
const MAX_TOKENS = 1024;
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

async function handleChat(body, ip = "unknown") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 500, json: { error: "Server is not configured (missing API key)." } };

  if (isRateLimited(ip)) return { status: 429, json: { error: "Too many requests. Please wait a minute." } };

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return { status: 400, json: { error: "Message is empty." } };
  if (prompt.length > MAX_PROMPT_CHARS)
    return { status: 400, json: { error: `Message too long (max ${MAX_PROMPT_CHARS} characters).` } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const messages = buildMessages(body.history, prompt);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini API error:", res.status, await res.text());
      return { status: 502, json: { error: "AI service is unavailable right now. Try again." } };
    }

    const data = await res.json();
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
