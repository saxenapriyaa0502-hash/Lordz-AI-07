const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

const clip = (v) => (typeof v === "string" ? v.slice(0, 2000) : "");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ ok: false, error: "Too many reports. Try later." });

  const body = req.body || {};
  const reply = clip(body.reply);
  if (!reply) return res.status(400).json({ ok: false, error: "Nothing to report." });

  console.log("USER_REPORT " + JSON.stringify({
    time: new Date().toISOString(),
    prompt: clip(body.prompt),
    reply,
    note: clip(body.note),
  }));
  res.status(200).json({ ok: true });
};
