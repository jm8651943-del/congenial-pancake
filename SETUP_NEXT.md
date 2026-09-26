# OPTIMIZE setup

## Vercel infrastructure

1. Connect this repository to the intended Vercel project.
2. Provision Neon Postgres for the project and verify DATABASE_URL is present.
3. Generate a strong OPTIMIZE_ENCRYPTION_SECRET and store it as a Vercel environment variable.
4. Add the Jobber variables from .env.example.

Vercel's current Neon Marketplace integration can provision a Neon database and supply the connection variable to the project.

## Jobber

Configure the Jobber Developer Center callback URL to exactly match:

https://YOUR-VERCEL-DOMAIN.vercel.app/api/jobber/callback

Select only the Jobber scopes the OPTIMIZE product needs. Keep refresh-token rotation enabled for production / Marketplace use.

## Live test

1. Open /api/health.
2. Register an OPTIMIZE account at /.
3. Sign in.
4. Connect Jobber.
5. Approve access in Jobber.
6. Confirm /api/jobber/status is connected.
7. Run Radar and Jobber sync.
8. Disconnect from OPTIMIZE and verify Jobber reports the app disconnected.
9. Test APP_DISCONNECT from Jobber and verify the local connection is removed.

## Local UI

For a UI hosted at http://127.0.0.1:8765, configure:

OPTIMIZE_ALLOWED_ORIGINS=http://127.0.0.1:8765,http://localhost:8765
OPTIMIZE_COOKIE_SAMESITE=None
OPTIMIZE_COOKIE_SECURE=true

A production same-origin Vercel UI is the supported deployment model because browser third-party-cookie policies can block cross-site localhost-to-Vercel credential cookies.
