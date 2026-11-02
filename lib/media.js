// Embeddings (knowledge base) and Gemini voice
const { getKeys, isRateLimited } = require("./chat");

async function handleEmbed(body, ip) {
  const keys = getKeys();
  if (!keys.length) return { status: 500, json: { error: "Missing API key." } };
  if (isRateLimited(ip)) return { status: 429, json: { error: "Too many requests. Please wait a minute." } };
  const texts = (Array.isArray(body?.texts) ? body.texts : []).filter((t) => typeof t === "string" && t.trim()).slice(0, 20).map((t) => t.slice(0, 2000));
  if (!texts.length) return { status: 400, json: { error: "Nothing to embed." } };
  for (const dim of [256, 0]) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": keys[0] },
        body: JSON.stringify({ requests: texts.map((t) => Object.assign({ model: "models/gemini-embedding-001", content: { parts: [{ text: t }] } }, dim ? { outputDimensionality: dim } : {})) }),
      });
      if (r.ok) { const j = await r.json(); return { status: 200, json: { vectors: (j.embeddings || []).map((e) => e.values) } }; }
      console.error("Gemini embed error:", r.status);
    } catch (e) { console.error("Gemini embed failed:", e.name); }
  }
  return { status: 502, json: { error: "Embedding service unavailable. Try again." } };
}

async function handleTts(body, ip) {
  const keys = getKeys();
  if (!keys.length) return { status: 500, json: { error: "Missing API key." } };
  if (isRateLimited(ip)) return { status: 429, json: { error: "Too many requests." } };
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return { status: 400, json: { error: "Nothing to read." } };
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": keys[0] },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } } }),
    });
    if (!r.ok) { console.error("Gemini tts error:", r.status); return { status: 502, json: { error: "Voice service unavailable." } }; }
    const j = await r.json();
    const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
    if (!part) return { status: 502, json: { error: "No audio returned." } };
    return { status: 200, json: { audio: part.inlineData.data } };
  } catch (e) { return { status: 504, json: { error: "Voice request failed." } }; }
}

module.exports = { handleEmbed, handleTts };
