const crypto = require("node:crypto");

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireEncryptionSecret() {
  const secret = process.env.OPTIMIZE_ENCRYPTION_SECRET || process.env.JOBBER_SESSION_SECRET;
  if (!secret) throw new Error("Missing OPTIMIZE_ENCRYPTION_SECRET");
  return secret;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(requireEncryptionSecret()).digest();
}

function encryptText(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((x) => x.toString("base64url")).join(".");
}

function decryptText(payload) {
  try {
    const parts = String(payload || "").split(".");
    if (parts.length !== 3) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[0], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) return reject(error);
      resolve("scrypt$" + salt + "$" + key.toString("hex"));
    });
  });
}

function verifyPassword(password, encoded) {
  return new Promise((resolve, reject) => {
    const parts = String(encoded || "").split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return resolve(false);
    const expected = Buffer.from(parts[2], "hex");
    crypto.scrypt(String(password), parts[1], expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) return reject(error);
      resolve(constantTimeEqual(key, expected));
    });
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 12 && password.length <= 200;
}

module.exports = {
  randomToken,
  sha256Hex,
  constantTimeEqual,
  encryptText,
  decryptText,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  validateEmail,
  validatePassword,
};