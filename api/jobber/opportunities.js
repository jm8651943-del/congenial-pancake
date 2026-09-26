const { graphQL } = require("../../lib/jobber");
const { liveConnection } = require("../../lib/jobber-store");
const { requireAuth, noStore } = require("../../lib/auth");
const { applyCors } = require("../../lib/cors");

const QUERY = [
  "query OpportunityRadar {",
  "  requests(first: 25) {",
  "    nodes { id title requestStatus createdAt updatedAt source client { id firstName lastName companyName } property { id name } }",
  "  }",
  "  quotes(first: 25) {",
  "    nodes { id quoteNumber title quoteStatus createdAt sentAt updatedAt amounts { total } client { id firstName lastName companyName } property { id name } }",
  "  }",
  "  jobs(first: 25) {",
  "    nodes { id jobNumber title jobStatus startAt endAt total uninvoicedTotal updatedAt client { id firstName lastName companyName } property { id name } }",
  "  }",
  "}",
].join("\n");

function scoreRequest(item) {
  let score = 50;
  if (!item?.title) score -= 10;
  if (item?.requestStatus) score += 10;
  if (item?.property) score += 10;
  if (item?.source) score += 5;
  return Math.max(0, Math.min(100, score));
}

function scoreQuote(item) {
  let score = 55;
  if (item?.sentAt) score += 15;
  if (item?.amounts?.total > 0) score += 15;
  if (item?.quoteStatus) score += 5;
  return Math.max(0, Math.min(100, score));
}

function scoreJob(item) {
  let score = 45;
  if (item?.uninvoicedTotal > 0) score += 25;
  if (item?.total > 0) score += 10;
  if (item?.property) score += 10;
  return Math.max(0, Math.min(100, score));
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const context = await requireAuth(req, res);
    if (!context) return;

    const connection = await liveConnection(context.tenantId);
    const data = await graphQL(connection.accessToken, QUERY);
    const opportunities = [
      ...(data.requests?.nodes || []).map((x) => ({
        type: "request",
        id: x.id,
        title: x.title || "Work request",
        score: scoreRequest(x),
        source: "Jobber",
        record: x,
      })),
      ...(data.quotes?.nodes || []).map((x) => ({
        type: "quote",
        id: x.id,
        title: x.title || "Quote #" + x.quoteNumber,
        score: scoreQuote(x),
        source: "Jobber",
        record: x,
      })),
      ...(data.jobs?.nodes || [])
        .filter((x) => (x.uninvoicedTotal || 0) > 0)
        .map((x) => ({
          type: "job",
          id: x.id,
          title: x.title || "Job #" + x.jobNumber,
          score: scoreJob(x),
          source: "Jobber",
          record: x,
        })),
    ].sort((a, b) => b.score - a.score);

    return res.status(200).json({
      opportunities,
      generatedAt: new Date().toISOString(),
      source: "Jobber",
    });
  } catch (error) {
    console.error("[OPTIMIZE jobber/opportunities]", error.message);
    return res.status(error.status || 502).json({ error: error.message });
  }
};
