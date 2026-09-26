const { randomUUID } = require("node:crypto");
const { ensureSchema, query } = require("./db");
const { randomToken, sha256Hex, hashPassword, verifyPassword, normalizeEmail, validateEmail, validatePassword, constantTimeEqual } = require("./security");

const SESSION_COOKIE = "optimize_session";
const CSRF_COOKIE = "optimize_csrf";
const LEGACY_JOBBER_COOKIE = "optimize_jobber_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secureCookies() {
  if (process.env.OPTIMIZE_COOKIE_SECURE === "true") return true;
  if (process.env.OPTIMIZE_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function sameSite() {
  return process.env.OPTIMIZE_COOKIE_SAMESITE || "Lax";
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const result = {};
  for (const piece of raw.split(";")) {
    const index = piece.indexOf("=");
    if (index < 0) continue;
    const key = piece.slice(0, index).trim();
    const value = piece.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function appendCookies(res, values) {
  const existing = res.getHeader("Set-Cookie");
  const current = Array.isArray(existing) ? existing : existing ? [existing] : [];
  res.setHeader("Set-Cookie", current.concat(values));
}

function cookieString(name, value, options = {}) {
  const parts = [name + "=" + encodeURIComponent(value), "Path=/", "SameSite=" + sameSite()];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (secureCookies()) parts.push("Secure");
  if (options.maxAge != null) parts.push("Max-Age=" + options.maxAge);
  return parts.join("; ");
}

function setAuthCookies(res, sessionToken, csrfToken) {
  appendCookies(res, [
    cookieString(SESSION_COOKIE, sessionToken, { maxAge: SESSION_MAX_AGE }),
    cookieString(CSRF_COOKIE, csrfToken, { maxAge: SESSION_MAX_AGE, httpOnly: false }),
  ]);
}

function clearAuthCookies(res) {
  appendCookies(res, [
    cookieString(SESSION_COOKIE, "", { maxAge: 0 }),
    cookieString(CSRF_COOKIE, "", { maxAge: 0, httpOnly: false }),
    cookieString(LEGACY_JOBBER_COOKIE, "", { maxAge: 0 }),
  ]);
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
}

async function createSession(userId, tenantId) {
  await ensureSchema();
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const sessionId = randomUUID();
  await query(
    "INSERT INTO optimize_sessions (id, user_id, tenant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')",
    [sessionId, userId, tenantId, sha256Hex(sessionToken)]
  );
  return { sessionToken, csrfToken, sessionId };
}

async function getAuthContext(req) {
  await ensureSchema();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const result = await query(
    "SELECT s.id AS session_id, s.user_id, s.tenant_id, s.expires_at, u.email, u.display_name, m.role, t.name AS tenant_name FROM optimize_sessions s JOIN optimize_users u ON u.id = s.user_id JOIN optimize_memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id JOIN optimize_tenants t ON t.id = s.tenant_id WHERE s.token_hash = $1 LIMIT 1",
    [sha256Hex(token)]
  );
  const row = result.rows[0];
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await query("DELETE FROM optimize_sessions WHERE id = $1", [row.session_id]);
    return null;
  }

  await query("UPDATE optimize_sessions SET last_used_at = NOW() WHERE id = $1", [row.session_id]);

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    tenantName: row.tenant_name,
    expiresAt: row.expires_at,
  };
}

async function requireAuth(req, res) {
  const context = await getAuthContext(req);
  if (!context) {
    noStore(res);
    res.status(401).json({ authenticated: false, error: "Authentication required" });
    return null;
  }
  return context;
}

function requireCsrf(req, res) {
  const cookies = parseCookies(req);
  const cookie = cookies[CSRF_COOKIE];
  const header = req.headers["x-csrf-token"];
  if (!cookie || !header || !constantTimeEqual(cookie, header)) {
    res.status(403).json({ error: "CSRF validation failed" });
    return false;
  }
  return true;
}

async function authenticate(email, password) {
  await ensureSchema();
  const normalized = normalizeEmail(email);
  const result = await query("SELECT id, email, password_hash, display_name FROM optimize_users WHERE email = $1 LIMIT 1", [normalized]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;

  const membership = await query(
    "SELECT m.tenant_id, m.role, t.name AS tenant_name FROM optimize_memberships m JOIN optimize_tenants t ON t.id = m.tenant_id WHERE m.user_id = $1 ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END LIMIT 1",
    [user.id]
  );
  if (!membership.rows[0]) return null;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    tenantId: membership.rows[0].tenant_id,
    tenantName: membership.rows[0].tenant_name,
    role: membership.rows[0].role,
  };
}

async function registerAccount({ email, password, displayName, tenantName }) {
  await ensureSchema();
  const normalized = normalizeEmail(email);
  if (!validateEmail(normalized)) throw Object.assign(new Error("Enter a valid email address"), { status: 400 });
  if (!validatePassword(password)) throw Object.assign(new Error("Password must be 12-200 characters"), { status: 400 });

  const existing = await query("SELECT id FROM optimize_users WHERE email = $1 LIMIT 1", [normalized]);
  if (existing.rows[0]) throw Object.assign(new Error("An account already exists for that email"), { status: 409 });

  const userId = randomUUID();
  const tenantId = randomUUID();
  const workspace = String(tenantName || "My OPTIMIZE Workspace").trim().slice(0, 120) || "My OPTIMIZE Workspace";
  const passwordHash = await hashPassword(password);

  try {
    await query("INSERT INTO optimize_tenants (id, name) VALUES ($1, $2)", [tenantId, workspace]);
    await query("INSERT INTO optimize_users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)", [userId, normalized, passwordHash, String(displayName || "").trim().slice(0, 120) || null]);
    await query("INSERT INTO optimize_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')", [userId, tenantId]);
  } catch (error) {
    await query("DELETE FROM optimize_users WHERE id = $1", [userId]).catch(() => {});
    await query("DELETE FROM optimize_tenants WHERE id = $1", [tenantId]).catch(() => {});
    throw error;
  }

  return { userId, email: normalized, displayName: displayName || null, tenantId, tenantName: workspace, role: "owner" };
}

async function startUserSession(res, identity) {
  const session = await createSession(identity.userId, identity.tenantId);
  setAuthCookies(res, session.sessionToken, session.csrfToken);
  return identity;
}

async function endUserSession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    await ensureSchema();
    await query("DELETE FROM optimize_sessions WHERE token_hash = $1", [sha256Hex(token)]);
  }
  clearAuthCookies(res);
  noStore(res);
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  noStore,
  parseCookies,
  createSession,
  setAuthCookies,
  clearAuthCookies,
  getAuthContext,
  requireAuth,
  requireCsrf,
  authenticate,
  registerAccount,
  startUserSession,
  endUserSession,
  validateEmail,
  validatePassword,
};