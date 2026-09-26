const { ensureSchema, query } = require("./db");
const { encryptText, decryptText } = require("./security");
const { refreshAccessToken } = require("./jobber");

function decrypted(value, label) {
  const clear = decryptText(value);
  if (!clear) throw new Error("Unable to decrypt Jobber " + label);
  return clear;
}

async function getConnectionRow(tenantId) {
  await ensureSchema();
  const result = await query(
    "SELECT tenant_id, account_id, account_name, access_token_ciphertext, refresh_token_ciphertext, expires_at, connected_at, updated_at, status, last_error, refresh_lock_until FROM optimize_jobber_connections WHERE tenant_id = $1 LIMIT 1",
    [tenantId]
  );
  return result.rows[0] || null;
}

async function saveConnection({ tenantId, accountId, accountName, accessToken, refreshToken, expiresAt }) {
  await ensureSchema();
  const other = await query("SELECT tenant_id FROM optimize_jobber_connections WHERE account_id = $1 AND tenant_id <> $2 LIMIT 1", [accountId, tenantId]);
  if (other.rows[0]) throw Object.assign(new Error("That Jobber account is already connected to another OPTIMIZE workspace"), { status: 409 });

  await query(
    "INSERT INTO optimize_jobber_connections (tenant_id, account_id, account_name, access_token_ciphertext, refresh_token_ciphertext, expires_at, connected_at, updated_at, status, last_error, refresh_lock_until) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), 'connected', NULL, NULL) ON CONFLICT (tenant_id) DO UPDATE SET account_id = EXCLUDED.account_id, account_name = EXCLUDED.account_name, access_token_ciphertext = EXCLUDED.access_token_ciphertext, refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, expires_at = EXCLUDED.expires_at, updated_at = NOW(), status = 'connected', last_error = NULL, refresh_lock_until = NULL",
    [tenantId, accountId, accountName || null, encryptText(accessToken), encryptText(refreshToken), new Date(expiresAt)]
  );
}

async function liveConnection(tenantId) {
  let row = await getConnectionRow(tenantId);
  if (!row) throw Object.assign(new Error("Jobber is not connected"), { status: 401 });

  const decode = (r) => ({
    tenantId,
    accountId: r.account_id,
    accountName: r.account_name,
    accessToken: decrypted(r.access_token_ciphertext, "access token"),
    refreshToken: decrypted(r.refresh_token_ciphertext, "refresh token"),
    expiresAt: new Date(r.expires_at).getTime(),
    status: r.status,
  });

  if (new Date(row.expires_at).getTime() > Date.now() + 60_000) return decode(row);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const lock = await query(
      "UPDATE optimize_jobber_connections SET refresh_lock_until = NOW() + INTERVAL '30 seconds' WHERE tenant_id = $1 AND (refresh_lock_until IS NULL OR refresh_lock_until < NOW()) RETURNING access_token_ciphertext, refresh_token_ciphertext, expires_at, account_id, account_name, status",
      [tenantId]
    );

    if (!lock.rows[0]) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      row = await getConnectionRow(tenantId);
      if (!row) throw Object.assign(new Error("Jobber is not connected"), { status: 401 });
      if (new Date(row.expires_at).getTime() > Date.now() + 60_000) return decode(row);
      continue;
    }

    try {
      const current = lock.rows[0];
      const token = decrypted(current.refresh_token_ciphertext, "refresh token");
      const next = await refreshAccessToken(token);
      const nextExpires = Date.now() + (next.expires_in || 3600) * 1000;

      await query(
        "UPDATE optimize_jobber_connections SET access_token_ciphertext = $2, refresh_token_ciphertext = $3, expires_at = $4, updated_at = NOW(), status = 'connected', last_error = NULL, refresh_lock_until = NULL WHERE tenant_id = $1",
        [tenantId, encryptText(next.access_token), encryptText(next.refresh_token || token), new Date(nextExpires)]
      );

      return {
        tenantId,
        accountId: current.account_id,
        accountName: current.account_name,
        accessToken: next.access_token,
        refreshToken: next.refresh_token || token,
        expiresAt: nextExpires,
        status: "connected",
      };
    } catch (error) {
      await query(
        "UPDATE optimize_jobber_connections SET refresh_lock_until = NULL, status = 'error', last_error = $2, updated_at = NOW() WHERE tenant_id = $1",
        [tenantId, String(error.message || "Token refresh failed").slice(0, 500)]
      ).catch(() => {});
      throw Object.assign(new Error("Jobber authorization needs to be renewed"), { status: 401 });
    }
  }

  throw Object.assign(new Error("Jobber token refresh is busy; retry shortly"), { status: 503 });
}

async function disconnectTenant(tenantId) {
  await ensureSchema();
  await query("DELETE FROM optimize_jobber_connections WHERE tenant_id = $1", [tenantId]);
}

async function disconnectByAccountId(accountId) {
  await ensureSchema();
  await query("DELETE FROM optimize_jobber_connections WHERE account_id = $1", [accountId]);
}

async function recordWebhookEvent({ topic, accountId, itemId, occurredAt, payload }) {
  await ensureSchema();
  const eventKey = [topic || "UNKNOWN", accountId || "UNKNOWN", itemId || "NONE", occurredAt || "NONE"].join(":");
  const result = await query(
    "INSERT INTO optimize_jobber_webhook_events (event_key, topic, account_id, item_id, occurred_at, payload_json) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (event_key) DO NOTHING RETURNING event_key",
    [eventKey, topic, accountId, itemId || null, occurredAt || null, JSON.stringify(payload || {})]
  );
  return { eventKey, inserted: result.rows.length > 0 };
}

module.exports = { saveConnection, getConnectionRow, liveConnection, disconnectTenant, disconnectByAccountId, recordWebhookEvent };