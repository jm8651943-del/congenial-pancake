const { exchangeCode, graphQL, QUERIES } = require("../../lib/jobber");
const { ensureSchema, query } = require("../../lib/db");
const { decryptText, sha256Hex } = require("../../lib/security");
const { requireAuth, noStore } = require("../../lib/auth");
const { saveConnection } = require("../../lib/jobber-store");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { code, state, error, error_description: errorDescription } = req.query || {};
  if (error) return res.status(400).send("Jobber authorization was denied: " + (errorDescription || error));
  if (!code || !state) return res.status(400).send("Missing Jobber authorization code or state.");

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    await ensureSchema();

    const stateResult = await query(
      "SELECT id, verifier_ciphertext FROM optimize_oauth_states WHERE session_id = $1 AND state_hash = $2 AND expires_at > NOW() LIMIT 1",
      [context.sessionId, sha256Hex(state)]
    );

    const stateRow = stateResult.rows[0];
    if (!stateRow) return res.status(400).send("Invalid or expired OAuth state.");

    const verifier = decryptText(stateRow.verifier_ciphertext);
    if (!verifier) return res.status(400).send("OAuth state could not be recovered.");

    await query("DELETE FROM optimize_oauth_states WHERE id = $1", [stateRow.id]);

    const tokens = await exchangeCode(code, verifier);
    const account = await graphQL(tokens.access_token, QUERIES.account);

    if (!account || !account.account || !account.account.id) {
      throw new Error("Jobber account identity was not returned");
    }

    await saveConnection({
      tenantId: context.tenantId,
      accountId: account.account.id,
      accountName: account.account.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    });

    return res.redirect(302, "/?jobber=connected");
  } catch (error) {
    console.error("[OPTIMIZE jobber/callback]", error.message);
    return res.status(error.status || 500).send(
      error.status === 409
        ? error.message
        : "Jobber connection failed. Please retry authorization."
    );
  }
};
