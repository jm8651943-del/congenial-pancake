const { applyCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  return res.status(200).json({
    ok: true,
    service: "OPTIMIZE",
    integrations: {
      jobberConfigured: Boolean(
        process.env.JOBBER_CLIENT_ID &&
        process.env.JOBBER_CLIENT_SECRET &&
        process.env.JOBBER_REDIRECT_URI
      ),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      encryptionConfigured: Boolean(
        process.env.OPTIMIZE_ENCRYPTION_SECRET ||
        process.env.JOBBER_SESSION_SECRET
      ),
    },
    timestamp: new Date().toISOString(),
  });
};
