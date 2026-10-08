// Vercel serverless function -> POST /api/chat
const { handleChat } = require("../lib/chat");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const { status, json } = await handleChat(req.body, ip);
  res.status(status).json(json);
};
