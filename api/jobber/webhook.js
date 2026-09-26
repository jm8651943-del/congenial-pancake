const crypto = require("node:crypto");
const { disconnectByAccountId, recordWebhookEvent } = require("../../lib/jobber-store");

function verifySignature(rawBody, signature) {
  if (!signature || !process.env.JOBBER_CLIENT_SECRET) return false;
  const digest = crypto.createHmac("sha256", process.env.JOBBER_CLIENT_SECRET).update(rawBody).digest("base64");
  const actual = Buffer.from(digest);
  const provided = Buffer.from(String(signature));
  return actual.length === provided.length && crypto.timingSafeEqual(actual, provided);
}

function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error("[OPTIMIZE jobber/webhook] raw body", error.message);
    return res.status(400).json({ error: "Invalid webhook body" });
  }

  const signature = req.headers["x-jobber-hmac-sha256"];
  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid Jobber webhook signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON webhook payload" });
  }

  const event = payload?.data?.webHookEvent;
  if (!event?.topic || !event?.accountId) {
    return res.status(400).json({ error: "Missing webhook event metadata" });
  }

  try {
    const recorded = await recordWebhookEvent({
      topic: event.topic,
      accountId: event.accountId,
      itemId: event.itemId || null,
      occurredAt: event.occurredAt || event.occuredAt || null,
      payload,
    });

    if (event.topic === "APP_DISCONNECT") {
      await disconnectByAccountId(event.accountId);
    }

    return res.status(200).json({
      received: true,
      duplicate: !recorded.inserted,
      topic: event.topic,
      accountId: event.accountId,
      itemId: event.itemId || null,
      action: event.topic === "APP_DISCONNECT" ? "connection-removed" : "event-recorded",
    });
  } catch (error) {
    console.error("[OPTIMIZE jobber/webhook]", error.message);
    return res.status(500).json({ error: "Webhook processing unavailable" });
  }
};

module.exports.config = { api: { bodyParser: false } };
