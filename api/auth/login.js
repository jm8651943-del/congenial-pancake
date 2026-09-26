const { authenticate, startUserSession, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(String(req.body || "{}"));
    const identity = await authenticate(body.email, body.password);
    if (!identity) return res.status(401).json({ authenticated: false, error: "Invalid email or password" });
    await startUserSession(res, identity);
    return res.status(200).json({
      authenticated: true,
      user: { email: identity.email, displayName: identity.displayName },
      tenant: { id: identity.tenantId, name: identity.tenantName, role: identity.role },
    });
  } catch (error) {
    console.error("[OPTIMIZE auth/login]", error.message);
    return res.status(500).json({ authenticated: false, error: "Unable to sign in" });
  }
};
