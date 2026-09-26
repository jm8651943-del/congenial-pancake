const { graphQL, QUERIES } = require("../../lib/jobber");
const { liveConnection } = require("../../lib/jobber-store");
const { requireAuth, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const type = String(req.query?.type || "snapshot").toLowerCase();
  try {
    const context = await requireAuth(req, res);
    if (!context) return;
    const connection = await liveConnection(context.tenantId);

    if (type === "account") return res.status(200).json({ data: await graphQL(connection.accessToken, QUERIES.account) });
    if (type === "clients") return res.status(200).json({ data: await graphQL(connection.accessToken, QUERIES.clients) });
    if (type === "jobs") return res.status(200).json({ data: await graphQL(connection.accessToken, QUERIES.jobs) });
    if (type === "snapshot") {
      const [account, clients, jobs] = await Promise.all([
        graphQL(connection.accessToken, QUERIES.account),
        graphQL(connection.accessToken, QUERIES.clients),
        graphQL(connection.accessToken, QUERIES.jobs),
      ]);
      return res.status(200).json({ data: { account, clients, jobs } });
    }
    return res.status(400).json({ error: "Supported types: account, clients, jobs, snapshot" });
  } catch (error) {
    console.error("[OPTIMIZE jobber/data]", error.message);
    return res.status(error.status || 502).json({ error: error.message });
  }
};
