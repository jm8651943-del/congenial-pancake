const { SOURCE_REGISTRY } = require("../../lib/open-sources");
const { requireAuth, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      sources: SOURCE_REGISTRY,
    });
  } catch (error) {
    console.error("[OPTIMIZE radar/sources]", error.message);
    return res.status(500).json({ error: "Unable to load sources" });
  }
};
