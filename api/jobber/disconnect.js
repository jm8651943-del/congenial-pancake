const { graphQL, getDisconnectMutation } = require("../../lib/jobber");
const { liveConnection, disconnectTenant } = require("../../lib/jobber-store");
const { requireAuth, requireCsrf, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireCsrf(req, res)) return;

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    const connection = await liveConnection(context.tenantId);
    try {
      const result = await graphQL(connection.accessToken, getDisconnectMutation());
      const errors = result?.appDisconnect?.userErrors || [];
      if (errors.length) {
        throw Object.assign(new Error(errors.map((x) => x.message).join("; ")), { status: 502 });
      }
    } finally {
      await disconnectTenant(context.tenantId);
    }

    return res.status(200).json({ connected: false });
  } catch (error) {
    console.error("[OPTIMIZE jobber/disconnect]", error.message);
    return res.status(error.status || 502).json({ error: error.message });
  }
};
