const { applyCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  return res.status(200).json({
    ok: true,
    service: "OPTIMIZE",
    integrations: { jobber: Boolean(process.env.JOBBER_CLIENT_ID) },
    timestamp: new Date().toISOString(),
  });
};
