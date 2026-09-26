const { requireAuth, noStore } = require("../../lib/auth");
const { getConnectionRow } = require("../../lib/jobber-store");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    const connection = await getConnectionRow(context.tenantId);
    return res.status(200).json({
      connected: Boolean(connection),
      account: connection ? { id: connection.account_id, name: connection.account_name } : null,
      status: connection ? connection.status : "disconnected",
      connectedAt: connection ? connection.connected_at : null,
      expiresAt: connection ? connection.expires_at : null,
      lastError: connection?.last_error || null,
    });
  } catch (error) {
    console.error("[OPTIMIZE jobber/status]", error.message);
    return res.status(500).json({ connected: false, error: "Status unavailable" });
  }
};
