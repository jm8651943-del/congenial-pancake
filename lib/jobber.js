const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
const JOBBER_OAUTH_AUTHORIZE_URL = "https://api.getjobber.com/api/oauth/authorize";
const JOBBER_OAUTH_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const JOBBER_GRAPHQL_VERSION = process.env.JOBBER_GRAPHQL_VERSION || "2025-04-16";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomString(bytes = 32) {
  const crypto = require("node:crypto");
  return base64url(crypto.randomBytes(bytes));
}

function createPkce() {
  const crypto = require("node:crypto");
  const verifier = randomString(48);
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function createAuthorizationUrl() {
  const clientId = requiredEnv("JOBBER_CLIENT_ID");
  const redirectUri = requiredEnv("JOBBER_REDIRECT_URI");
  const scopes = requiredEnv("JOBBER_SCOPES");
  const state = randomString(32);
  const { verifier, challenge } = createPkce();
  const url = new URL(JOBBER_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", scopes);
  return { url: url.toString(), state, verifier };
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    client_id: requiredEnv("JOBBER_CLIENT_ID"),
    client_secret: requiredEnv("JOBBER_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: requiredEnv("JOBBER_REDIRECT_URI"),
    code_verifier: verifier,
  });

  const response = await fetch(JOBBER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Jobber token exchange failed (${response.status})`);
  }

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Jobber token response did not include both access_token and refresh_token");
  }

  return payload;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: requiredEnv("JOBBER_CLIENT_ID"),
    client_secret: requiredEnv("JOBBER_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(JOBBER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Jobber token refresh failed (${response.status})`);
  }

  if (!payload.access_token) throw new Error("Jobber refresh response did not include access_token");

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || refreshToken,
    expires_in: payload.expires_in || 3600,
    token_type: payload.token_type || "Bearer",
  };
}

async function graphQL(accessToken, query, variables = {}) {
  const response = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-jobber-graphql-version": JOBBER_GRAPHQL_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || `Jobber API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (payload.errors?.length) {
    const error = new Error(payload.errors.map((e) => e.message).join("; "));
    error.status = 400;
    error.payload = payload;
    throw error;
  }

  return payload.data;
}

const QUERIES = {
  account: `
    query GetAccount {
      account { id name }
    }
  `,
  clients: `
    query GetClients {
      clients(first: 25) {
        nodes {
          id
          firstName
          lastName
          companyName
          billingAddress { city province postalCode }
        }
        pageInfo { hasNextPage endCursor }
        totalCount
      }
    }
  `,
  jobs: `
    query GetJobs {
      jobs(first: 25) {
        nodes {
          id
          jobNumber
          title
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
};

module.exports = {
  JOBBER_GRAPHQL_VERSION,
  createAuthorizationUrl,
  exchangeCode,
  refreshAccessToken,
  graphQL,
  QUERIES,
};
