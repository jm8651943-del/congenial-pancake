const { readJobberSession } = require("../../lib/session");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = readJobberSession(req);
  if (!session) return res.status(200).json({ connected: false });

  return res.status(200).json({
    connected: true,
    account: session.account || null,
    connectedAt: session.connectedAt || null,
    expiresAt: session.expiresAt || null,
  });
};
