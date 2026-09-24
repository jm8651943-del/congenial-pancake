const { createAuthorizationUrl } = require("../../lib/jobber");
const { saveOAuthState } = require("../../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { url, state, verifier } = createAuthorizationUrl();
    saveOAuthState(res, { state, verifier, createdAt: Date.now() });
    return res.redirect(302, url);
  } catch (error) {
    return res.status(500).json({
      connected: false,
      error: error.message,
      hint: "Set JOBBER_CLIENT_ID, JOBBER_CLIENT_SECRET, JOBBER_REDIRECT_URI, JOBBER_SCOPES, and JOBBER_SESSION_SECRET in Vercel.",
    });
  }
};
