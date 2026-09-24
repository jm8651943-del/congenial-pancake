const crypto = require("node:crypto");

function verifySignature(rawBody, signature) {
  if (!signature || !process.env.JOBBER_CLIENT_SECRET) return false;
  const digest = crypto
    .createHmac("sha256", process.env.JOBBER_CLIENT_SECRET)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Vercel may provide the body as an object. For production webhook verification,
  // configure raw-body handling so the exact request bytes are available.
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const signature = req.headers["x-jobber-hmac-sha256"];

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid Jobber webhook signature" });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const event = payload?.data?.webHookEvent;

  // Acknowledge quickly. Durable processing belongs in a queue/database worker.
  return res.status(200).json({
    received: true,
    topic: event?.topic || null,
    accountId: event?.accountId || null,
    itemId: event?.itemId || null,
    occurredAt: event?.occurredAt || event?.occuredAt || null,
  });
};
