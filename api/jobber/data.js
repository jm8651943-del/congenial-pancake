const {
  graphQL,
  refreshAccessToken,
  QUERIES,
} = require("../../lib/jobber");
const {
  readJobberSession,
  saveJobberSession,
  clearJobberSession,
} = require("../../lib/session");

async function getLiveSession(req, res) {
  let session = readJobberSession(req);
  if (!session) {
    const error = new Error("Jobber is not connected");
    error.status = 401;
    throw error;
  }

  if (session.expiresAt && Date.now() > session.expiresAt - 60_000) {
    const tokens = await refreshAccessToken(session.refreshToken);
    session = {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    };
    saveJobberSession(res, session);
  }

  return session;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const type = String(req.query?.type || "snapshot").toLowerCase();

  try {
    const session = await getLiveSession(req, res);

    if (type === "account") {
      return res.status(200).json({ data: await graphQL(session.accessToken, QUERIES.account) });
    }

    if (type === "clients") {
      return res.status(200).json({ data: await graphQL(session.accessToken, QUERIES.clients) });
    }

    if (type === "jobs") {
      return res.status(200).json({ data: await graphQL(session.accessToken, QUERIES.jobs) });
    }

    if (type === "snapshot") {
      const [account, clients, jobs] = await Promise.all([
        graphQL(session.accessToken, QUERIES.account),
        graphQL(session.accessToken, QUERIES.clients),
        graphQL(session.accessToken, QUERIES.jobs),
      ]);
      return res.status(200).json({ data: { account, clients, jobs } });
    }

    return res.status(400).json({ error: "Supported types: account, clients, jobs, snapshot" });
  } catch (error) {
    if (error.message.toLowerCase().includes("disconnected")) clearJobberSession(res);

    return res.status(error.status === 401 ? 401 : 502).json({
      error: error.message,
    });
  }
};
