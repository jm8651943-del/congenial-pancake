const { SOURCE_REGISTRY } = require("../../lib/open-sources");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    sources: SOURCE_REGISTRY,
  });
};
