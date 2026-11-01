// Vercel serverless function -> POST /api/stream (word-by-word answers)
const { handleStream } = require("../lib/chat");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  await handleStream(req.body, ip, res);
};
