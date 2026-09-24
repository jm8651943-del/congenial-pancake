const { clearJobberSession } = require("../../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  clearJobberSession(res);
  return res.status(200).json({ connected: false });
};
