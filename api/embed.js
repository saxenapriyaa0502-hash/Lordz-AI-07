// Vercel serverless function -> POST /api/embed
const { handleEmbed } = require("../lib/media");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const { status, json } = await handleEmbed(req.body, ip);
  res.status(status).json(json);
};
