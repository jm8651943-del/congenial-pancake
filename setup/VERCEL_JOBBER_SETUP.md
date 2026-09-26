# Vercel + Jobber + OPTIMIZE

1. Deploy jm8651943-del/congenial-pancake to the intended Vercel project.
2. Provision/connect Neon Postgres and ensure DATABASE_URL exists in Vercel.
3. Generate a strong OPTIMIZE_ENCRYPTION_SECRET.
4. In Jobber Developer Center, set the OAuth callback URL to:
   https://YOUR-VERCEL-DOMAIN.vercel.app/api/jobber/callback
5. Add:
   DATABASE_URL
   OPTIMIZE_ENCRYPTION_SECRET
   JOBBER_CLIENT_ID
   JOBBER_CLIENT_SECRET
   JOBBER_REDIRECT_URI
   JOBBER_GRAPHQL_VERSION=2025-04-16
6. Production cookies should use HTTPS and SameSite=Lax.
7. For a local UI on http://127.0.0.1:8765, allow that exact origin and use SameSite=None with Secure cookies.
8. Never put Jobber client secrets or tokens in HTML, public JavaScript, GitHub, or client-side storage.
9. The database tables are created automatically; db/schema.sql is also included for explicit provisioning.
10. Verify account registration, login, Jobber OAuth, token refresh, /api/jobber/status, Radar, sync, disconnect/appDisconnect, and APP_DISCONNECT webhook handling.

The current authentication layer is tenant-aware and server-side for integration credentials. Separate future product work includes MFA, password recovery, organization invitations, billing controls, and asynchronous event workers.
