const { getAuthContext, parseCookies, noStore, setAuthCookies } = require("../../lib/auth");
const { randomToken } = require("../../lib/security");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const context = await getAuthContext(req);
    if (!context) return res.status(200).json({ authenticated: false });

    const cookies = parseCookies(req);
    if (!cookies.optimize_csrf && cookies.optimize_session) {
      setAuthCookies(res, cookies.optimize_session, randomToken(32));
    }

    return res.status(200).json({
      authenticated: true,
      user: { email: context.email, displayName: context.displayName },
      tenant: { id: context.tenantId, name: context.tenantName, role: context.role },
      expiresAt: context.expiresAt,
    });
  } catch (error) {
    console.error("[OPTIMIZE auth/session]", error.message);
    return res.status(500).json({ authenticated: false, error: "Session service unavailable" });
  }
};
