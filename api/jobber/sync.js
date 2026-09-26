const { graphQL } = require("../../lib/jobber");
const { liveConnection } = require("../../lib/jobber-store");
const { requireAuth, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

const COLLECTIONS = {
  clients: "clients(first: 25) { nodes { id firstName lastName companyName updatedAt } pageInfo { hasNextPage endCursor } totalCount }",
  jobs: "jobs(first: 25) { nodes { id jobNumber title jobStatus startAt endAt total uninvoicedTotal updatedAt client { id name } property { id name } } pageInfo { hasNextPage endCursor } }",
  quotes: "quotes(first: 25) { nodes { id quoteNumber title quoteStatus createdAt sentAt updatedAt amounts { total } client { id name } property { id name } } pageInfo { hasNextPage endCursor } }",
  requests: "requests(first: 25) { nodes { id title requestStatus createdAt updatedAt source client { id name } property { id name } } pageInfo { hasNextPage endCursor } }",
  visits: "visits(first: 25) { nodes { id title visitStatus startAt endAt isComplete client { id name } job { id jobNumber } property { id name } } pageInfo { hasNextPage endCursor } }",
  invoices: "invoices(first: 25) { nodes { id invoiceNumber invoiceStatus issuedDate updatedAt subject amounts { total } } pageInfo { hasNextPage endCursor } }",
};

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const requested = String(req.query?.resource || "all").toLowerCase();
  const resources = requested === "all" ? Object.keys(COLLECTIONS) : [requested];

  if (resources.some((name) => !COLLECTIONS[name])) {
    return res.status(400).json({ error: "Unknown resource. Use: " + Object.keys(COLLECTIONS).join(", ") });
  }

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    const connection = await liveConnection(context.tenantId);
    const data = {};
    for (const name of resources) {
      data[name] = await graphQL(connection.accessToken, "query OptimizeSync { " + COLLECTIONS[name] + " }");
    }

    return res.status(200).json({ data, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[OPTIMIZE jobber/sync]", error.message);
    return res.status(error.status || 502).json({ error: error.message });
  }
};
