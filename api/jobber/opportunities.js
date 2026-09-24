const { graphQL, refreshAccessToken } = require("../../lib/jobber");
const { readJobberSession, saveJobberSession } = require("../../lib/session");

const QUERY = `
query OpportunityRadar {
  requests(first: 25) {
    nodes {
      id title requestStatus createdAt updatedAt source
      client { id firstName lastName companyName }
      property { id name }
    }
  }
  quotes(first: 25) {
    nodes {
      id quoteNumber title quoteStatus createdAt sentAt updatedAt
      amounts { total }
      client { id firstName lastName companyName }
      property { id name }
    }
  }
  jobs(first: 25) {
    nodes {
      id jobNumber title jobStatus startAt endAt total uninvoicedTotal updatedAt
      client { id firstName lastName companyName }
      property { id name }
    }
  }
}
`;

async function getSession(req, res) {
  let current = readJobberSession(req);
  if (!current) throw Object.assign(new Error("Jobber is not connected"), { status: 401 });
  if (current.expiresAt && Date.now() > current.expiresAt - 60000) {
    const next = await refreshAccessToken(current.refreshToken);
    current = { ...current, accessToken: next.access_token, refreshToken: next.refresh_token,
      expiresAt: Date.now() + (next.expires_in || 3600) * 1000 };
    saveJobberSession(res, current);
  }
  return current;
}

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
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const current = await getSession(req, res);
    const data = await graphQL(current.accessToken, QUERY);
    const opportunities = [
      ...(data.requests?.nodes || []).map((x) => ({ type:"request", id:x.id, title:x.title || "Work request", score:scoreRequest(x), source:"Jobber", record:x })),
      ...(data.quotes?.nodes || []).map((x) => ({ type:"quote", id:x.id, title:x.title || `Quote #${x.quoteNumber}`, score:scoreQuote(x), source:"Jobber", record:x })),
      ...(data.jobs?.nodes || []).filter((x) => (x.uninvoicedTotal || 0) > 0).map((x) => ({ type:"job", id:x.id, title:x.title || `Job #${x.jobNumber}`, score:scoreJob(x), source:"Jobber", record:x })),
    ].sort((a,b) => b.score - a.score);

    return res.status(200).json({ opportunities, generatedAt:new Date().toISOString(), source:"Jobber" });
  } catch (error) {
    return res.status(error.status || 502).json({ error:error.message });
  }
};
