# Vercel + Jobber setup for OPTIMIZE

1. Deploy the repository to Vercel.
2. In Jobber Developer Center, set the OAuth callback URL to:
   https://YOUR-VERCEL-DOMAIN.vercel.app/api/jobber/callback
3. Put these values in Vercel Environment Variables:
   JOBBER_CLIENT_ID
   JOBBER_CLIENT_SECRET
   JOBBER_REDIRECT_URI
   JOBBER_GRAPHQL_VERSION=2025-04-16
   JOBBER_SESSION_SECRET=<long-random-secret>
4. Do not add a JOBBER_SCOPES variable. Jobber scopes are configured on the app in the Developer Center.
5. For a local OPTIMIZE HTML served at http://127.0.0.1:8765, also set:
   OPTIMIZE_ALLOWED_ORIGINS=http://127.0.0.1:8765,http://localhost:8765
   JOBBER_COOKIE_SAMESITE=None
   JOBBER_COOKIE_SECURE=true
6. Include the browser client:
   <script src="https://YOUR-VERCEL-DOMAIN.vercel.app/optimize-jobber-client.js"></script>
7. In the local HTML:
   window.OPTIMIZE_API_BASE = "https://YOUR-VERCEL-DOMAIN.vercel.app";
   const jobber = window.OPTIMIZE_JOBBER(window.OPTIMIZE_API_BASE);
8. Use jobber.connect(), jobber.status(), jobber.snapshot(), jobber.opportunities(), and jobber.sync().

Production SaaS note:
The current MVP session is encrypted and cookie-backed. Before onboarding multiple paying companies, move Jobber refresh tokens into durable encrypted storage keyed by OPTIMIZE tenant/account ID and process webhooks asynchronously. Jobber requires APP_DISCONNECT handling for Marketplace publication.
