let sqlClient;
let schemaPromise;

async function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL. Connect a Postgres database to OPTIMIZE.");
  }
  if (!sqlClient) {
    const mod = await import("@neondatabase/serverless");
    sqlClient = mod.neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

async function query(text, params = []) {
  const sql = await getSql();
  return sql.query(text, params);
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const statements = [
        "CREATE TABLE IF NOT EXISTS optimize_tenants (id UUID PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS optimize_users (id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE TABLE IF NOT EXISTS optimize_memberships (user_id UUID NOT NULL REFERENCES optimize_users(id) ON DELETE CASCADE, tenant_id UUID NOT NULL REFERENCES optimize_tenants(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'owner', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, tenant_id))",
        "CREATE TABLE IF NOT EXISTS optimize_sessions (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES optimize_users(id) ON DELETE CASCADE, tenant_id UUID NOT NULL REFERENCES optimize_tenants(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS optimize_sessions_expiry_idx ON optimize_sessions (expires_at)",
        "CREATE TABLE IF NOT EXISTS optimize_oauth_states (id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES optimize_sessions(id) ON DELETE CASCADE, state_hash TEXT NOT NULL UNIQUE, verifier_ciphertext TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS optimize_oauth_states_expiry_idx ON optimize_oauth_states (expires_at)",
        "CREATE TABLE IF NOT EXISTS optimize_jobber_connections (tenant_id UUID PRIMARY KEY REFERENCES optimize_tenants(id) ON DELETE CASCADE, account_id TEXT NOT NULL UNIQUE, account_name TEXT, access_token_ciphertext TEXT NOT NULL, refresh_token_ciphertext TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'connected', last_error TEXT, refresh_lock_until TIMESTAMPTZ)",
        "CREATE INDEX IF NOT EXISTS optimize_jobber_connections_status_idx ON optimize_jobber_connections (status)",
        "CREATE TABLE IF NOT EXISTS optimize_jobber_webhook_events (event_key TEXT PRIMARY KEY, topic TEXT NOT NULL, account_id TEXT NOT NULL, item_id TEXT, occurred_at TEXT, payload_json JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ)",
        "CREATE INDEX IF NOT EXISTS optimize_jobber_webhook_account_idx ON optimize_jobber_webhook_events (account_id, received_at)",
      ];
      for (const statement of statements) await query(statement);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { query, ensureSchema };