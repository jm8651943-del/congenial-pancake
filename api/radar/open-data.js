const { collectOpenSourceSignals } = require("../../lib/open-sources");
const { requireAuth, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    const sourceIds = String(req.query?.sources || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const includeAll =
      String(req.query?.all || "").toLowerCase() === "true" ||
      String(req.query?.all || "") === "1";

    const payload = await collectOpenSourceSignals({ sourceIds, includeAll });
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[OPTIMIZE radar/open-data]", error.message);
    return res.status(502).json({ error: error.message });
  }
};
