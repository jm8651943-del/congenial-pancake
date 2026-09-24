const crypto = require("node:crypto");

const COOKIE_NAME = "optimize_jobber_session";
const OAUTH_COOKIE = "optimize_jobber_oauth";

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

function requireSessionSecret() {
  if (!process.env.JOBBER_SESSION_SECRET) {
    throw new Error("Missing required environment variable: JOBBER_SESSION_SECRET");
  }
  return process.env.JOBBER_SESSION_SECRET;
}

function encrypt(value) {
  const key = keyFromSecret(requireSessionSecret());
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value) {
  try {
    const [ivText, tagText, encryptedText] = value.split(".");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      keyFromSecret(requireSessionSecret()),
      Buffer.from(ivText, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const clear = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(clear);
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").filter(Boolean).map((piece) => {
      const index = piece.indexOf("=");
      const key = piece.slice(0, index).trim();
      const value = piece.slice(index + 1).trim();
      return [key, decodeURIComponent(value)];
    })
  );
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearCookie(res, name) {
  setCookie(res, name, "", { maxAge: 0 });
}

function saveOAuthState(res, data) {
  setCookie(res, OAUTH_COOKIE, encrypt(data), { maxAge: 600 });
}

function readOAuthState(req) {
  const cookies = parseCookies(req);
  return cookies[OAUTH_COOKIE] ? decrypt(cookies[OAUTH_COOKIE]) : null;
}

function clearOAuthState(res) {
  clearCookie(res, OAUTH_COOKIE);
}

function saveJobberSession(res, data) {
  setCookie(res, COOKIE_NAME, encrypt(data), { maxAge: 60 * 60 * 24 * 30 });
}

function readJobberSession(req) {
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] ? decrypt(cookies[COOKIE_NAME]) : null;
}

function clearJobberSession(res) {
  clearCookie(res, COOKIE_NAME);
}

module.exports = {
  saveOAuthState,
  readOAuthState,
  clearOAuthState,
  saveJobberSession,
  readJobberSession,
  clearJobberSession,
};
