const { createAuthorizationUrl } = require("../../lib/jobber");
const { ensureSchema, query } = require("../../lib/db");
const { encryptText, sha256Hex } = require("../../lib/security");
const { requireAuth, noStore } = require("../../lib/auth");
const { randomUUID } = require("node:crypto");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    await ensureSchema();
    const { url, state, verifier } = createAuthorizationUrl();

    await query(
      "INSERT INTO optimize_oauth_states (id, session_id, state_hash, verifier_ciphertext, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')",
      [randomUUID(), context.sessionId, sha256Hex(state), encryptText(verifier)]
    );

    return res.redirect(302, url);
  } catch (error) {
    console.error("[OPTIMIZE jobber/auth]", error.message);
    return res.status(500).json({ error: "Unable to start Jobber authorization" });
  }
};
