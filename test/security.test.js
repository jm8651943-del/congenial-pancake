const test = require("node:test");
const assert = require("node:assert/strict");
const {
  randomToken,
  encryptText,
  decryptText,
  hashPassword,
  verifyPassword,
  constantTimeEqual,
  sha256Hex,
} = require("../lib/security");

test("random tokens are high entropy strings", () => {
  const token = randomToken(32);
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 40);
});

test("AES-GCM encryption round trips and changes ciphertext", () => {
  process.env.OPTIMIZE_ENCRYPTION_SECRET = "test-secret-" + randomToken(16);
  const first = encryptText("jobber-refresh-token");
  const second = encryptText("jobber-refresh-token");
  assert.notEqual(first, second);
  assert.equal(decryptText(first), "jobber-refresh-token");
  assert.equal(decryptText(second), "jobber-refresh-token");
  assert.equal(decryptText("not-a-valid-ciphertext"), null);
});

test("password hashes verify without storing the plaintext", async () => {
  const password = "Correct Horse Battery Staple 123!";
  const encoded = await hashPassword(password);
  assert.ok(encoded.startsWith("scrypt$"));
  assert.notEqual(encoded, password);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
});

test("constant time comparison and token hashing are deterministic", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(sha256Hex("abc"), sha256Hex("abc"));
  assert.notEqual(sha256Hex("abc"), sha256Hex("abd"));
});
