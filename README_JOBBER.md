# OPTIMIZE + Jobber authentication

## Production architecture

OPTIMIZE now uses:

Browser
-> opaque HttpOnly OPTIMIZE session cookie
-> Vercel API function
-> encrypted tenant-scoped Jobber credentials in Postgres
-> Jobber OAuth 2.0 / GraphQL API

Jobber access and refresh tokens are not stored in the browser session.

## OAuth flow

1. A signed-in OPTIMIZE user opens GET /api/jobber/auth.
2. OPTIMIZE creates OAuth state plus a PKCE verifier/challenge.
3. State is stored server-side against the OPTIMIZE session for 10 minutes. The PKCE verifier is encrypted at rest.
4. Jobber redirects to /api/jobber/callback with code and state.
5. OPTIMIZE validates the state against the current session.
6. The authorization code is exchanged on the server using JOBBER_CLIENT_SECRET and the original PKCE verifier.
7. OPTIMIZE queries Jobber's account object and stores the Jobber account ID/name plus encrypted access and refresh tokens under the OPTIMIZE tenant.
8. Subsequent Jobber requests load the tenant connection server-side.
9. Access tokens refresh automatically before expiry. Rotated refresh tokens replace the previous stored refresh token.
10. Disconnect calls Jobber's appDisconnect mutation, then removes the local connection.

Jobber access tokens expire after 60 minutes and refresh-token rotation should remain enabled for production / Marketplace use.

## OPTIMIZE application authentication

First-party account endpoints:

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/session
- POST /api/auth/logout

Passwords use Node.js scrypt. Sessions use random opaque tokens; only SHA-256 token hashes are stored in Postgres. The browser receives an HttpOnly session cookie plus a separate CSRF cookie. State-changing browser requests require X-CSRF-Token to match the CSRF cookie.

## Webhooks

POST /api/jobber/webhook verifies X-Jobber-Hmac-SHA256 against the raw request body using JOBBER_CLIENT_SECRET. Verified events are persisted idempotently. APP_DISCONNECT deletes the connection for the matching Jobber account.

## Required Vercel environment variables

- DATABASE_URL
- OPTIMIZE_ENCRYPTION_SECRET
- JOBBER_CLIENT_ID
- JOBBER_CLIENT_SECRET
- JOBBER_REDIRECT_URI
- JOBBER_GRAPHQL_VERSION

The old cookie-backed Jobber token session has been removed.

## Database

db/schema.sql contains the complete authentication / integration schema. The application also creates the required tables automatically through lib/db.js on first use.

Neon Postgres is the intended Vercel database integration, with DATABASE_URL kept server-side.

## Deployment security

Do not commit .env files, database URLs, Jobber client secrets, access tokens, refresh tokens, or exported credentials.

For a production same-origin Vercel deployment, keep SameSite=Lax and HTTPS.

For a local UI hosted on another origin, configure the exact origin in OPTIMIZE_ALLOWED_ORIGINS and use SameSite=None plus Secure cookies. Browser third-party-cookie policy may still limit localhost-to-Vercel sessions; production same-origin hosting is the supported path.
