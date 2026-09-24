const { exchangeCode, graphQL, QUERIES } = require("../../lib/jobber");
const {
  readOAuthState,
  clearOAuthState,
  saveJobberSession,
} = require("../../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { code, state, error, error_description: errorDescription } = req.query || {};
  if (error) return res.status(400).send(`Jobber authorization denied: ${errorDescription || error}`);
  if (!code || !state) return res.status(400).send("Missing Jobber authorization code or state.");

  try {
    const stored = readOAuthState(req);
    if (!stored || stored.state !== state) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }

    const tokens = await exchangeCode(code, stored.verifier);
    const account = await graphQL(tokens.access_token, QUERIES.account);

    saveJobberSession(res, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      account,
      connectedAt: new Date().toISOString(),
    });
    clearOAuthState(res);

    return res.redirect(302, "/?jobber=connected");
  } catch (error) {
    clearOAuthState(res);
    return res.status(500).send(`Jobber connection failed: ${error.message}`);
  }
};
