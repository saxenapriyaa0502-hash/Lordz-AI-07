// Vercel serverless function -> POST /api/tts
const { handleTts } = require("../lib/media");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const { status, json } = await handleTts(req.body, ip);
  res.status(status).json(json);
};
