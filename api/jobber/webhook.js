const crypto = require("node:crypto");

function verifySignature(rawBody, signature) {
  if (!signature || !process.env.JOBBER_CLIENT_SECRET) return false;
  const digest = crypto
    .createHmac("sha256", process.env.JOBBER_CLIENT_SECRET)
    .update(rawBody)
    .digest("base64");
  const actual = Buffer.from(digest);
  const provided = Buffer.from(String(signature));
  if (actual.length !== provided.length) return false;
  return crypto.timingSafeEqual(actual, provided);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const signature = req.headers["x-jobber-hmac-sha256"];

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid Jobber webhook signature" });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON webhook payload" });
  }

  const event = payload?.data?.webHookEvent;
  if (!event?.topic || !event?.accountId) {
    return res.status(400).json({ error: "Missing webhook event metadata" });
  }

  return res.status(200).json({
    received: true,
    topic: event.topic,
    accountId: event.accountId,
    itemId: event.itemId || null,
    occurredAt: event.occurredAt || event.occuredAt || null,
    action: event.topic === "APP_DISCONNECT" ? "mark-connection-inactive" : "queue-sync",
  });
};
