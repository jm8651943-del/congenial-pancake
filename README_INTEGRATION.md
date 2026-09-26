# OPTIMIZE integration paths

## Account boundary

OPTIMIZE requires an authenticated OPTIMIZE account for Radar and Jobber operations. Each registered account owns an OPTIMIZE tenant workspace. The current schema supports multiple memberships, while the initial UI selects the user's first owner membership.

## Authentication endpoints

- /api/auth/register
- /api/auth/login
- /api/auth/session
- /api/auth/logout

## Jobber endpoints

- /api/jobber/auth
- /api/jobber/callback
- /api/jobber/status
- /api/jobber/data
- /api/jobber/sync?resource=all
- /api/jobber/opportunities
- /api/jobber/webhook
- /api/jobber/disconnect

## Security boundary

Client secrets never enter browser JavaScript. Jobber access and refresh tokens are encrypted at rest and are only decrypted inside server-side code. Browser authentication uses an opaque HttpOnly session token; only its SHA-256 hash is stored in Postgres.

OAuth uses authorization code + PKCE. OAuth state is stored server-side and bound to the current OPTIMIZE session. State-changing browser requests require CSRF validation.

Jobber webhooks use X-Jobber-Hmac-SHA256 over the raw request body and are deduplicated before processing. APP_DISCONNECT removes the matching tenant connection.

## Remaining product hardening

Account recovery, email verification, MFA, organization invitations, billing entitlements, and a durable background queue for non-disconnect webhook processing remain separate product features. They are intentionally not mixed into the current credential-boundary migration.
