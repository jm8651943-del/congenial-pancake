const { endUserSession, requireCsrf } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireCsrf(req, res)) return;

  try {
    await endUserSession(req, res);
    return res.status(200).json({ authenticated: false });
  } catch (error) {
    console.error("[OPTIMIZE auth/logout]", error.message);
    return res.status(500).json({ error: "Unable to sign out" });
  }
};
