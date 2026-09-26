const { registerAccount, startUserSession, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(String(req.body || "{}"));
    const identity = await registerAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      tenantName: body.tenantName,
    });
    await startUserSession(res, identity);
    return res.status(201).json({
      authenticated: true,
      user: { email: identity.email, displayName: identity.displayName },
      tenant: { id: identity.tenantId, name: identity.tenantName, role: identity.role },
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("[OPTIMIZE auth/register]", error.message);
    return res.status(status).json({ error: status >= 500 ? "Unable to create account" : error.message });
  }
};
