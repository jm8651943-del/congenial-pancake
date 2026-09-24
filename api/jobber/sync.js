const { graphQL, refreshAccessToken } = require("../../lib/jobber");
const { readJobberSession, saveJobberSession } = require("../../lib/session");
const { applyCors } = require("../../lib/cors");

const COLLECTIONS = {
  clients: `clients(first: 25) { nodes { id firstName lastName companyName updatedAt } pageInfo { hasNextPage endCursor } totalCount }`,
  jobs: `jobs(first: 25) { nodes { id jobNumber title jobStatus startAt endAt total uninvoicedTotal updatedAt client { id name } property { id name } } pageInfo { hasNextPage endCursor } }`,
  quotes: `quotes(first: 25) { nodes { id quoteNumber title quoteStatus createdAt sentAt updatedAt amounts { total } client { id name } property { id name } } pageInfo { hasNextPage endCursor } }`,
  requests: `requests(first: 25) { nodes { id title requestStatus createdAt updatedAt source client { id name } property { id name } } pageInfo { hasNextPage endCursor } }`,
  visits: `visits(first: 25) { nodes { id title visitStatus startAt endAt isComplete client { id name } job { id jobNumber } property { id name } } pageInfo { hasNextPage endCursor } }`,
  invoices: `invoices(first: 25) { nodes { id invoiceNumber invoiceStatus issuedDate updatedAt subject amounts { total } } pageInfo { hasNextPage endCursor } }`,
};

async function getSession(req, res) {
  let current = readJobberSession(req);
  if (!current) throw Object.assign(new Error("Jobber is not connected"), { status: 401 });

  if (current.expiresAt && Date.now() > current.expiresAt - 60000) {
    const next = await refreshAccessToken(current.refreshToken);
    current = {
      ...current,
      accessToken: next.access_token,
      refreshToken: next.refresh_token,
      expiresAt: Date.now() + (next.expires_in || 3600) * 1000,
    };
    saveJobberSession(res, current);
  }
  return current;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const requested = String(req.query?.resource || "all").toLowerCase();
  const resources = requested === "all" ? Object.keys(COLLECTIONS) : [requested];

  if (resources.some((name) => !COLLECTIONS[name])) {
    return res.status(400).json({ error: `Unknown resource. Use: ${Object.keys(COLLECTIONS).join(", ")}` });
  }

  try {
    const current = await getSession(req, res);
    const results = {};
    for (const name of resources) {
      results[name] = await graphQL(current.accessToken, `query OptimizeSync { ${COLLECTIONS[name]} }`);
    }
    return res.status(200).json({ data: results, syncedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
};
