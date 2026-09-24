# OPTIMIZE + Jobber integration

This repo preserves the existing `OPTIMIZE_COMPLETE_v4.zip` and adds a Vercel-ready Jobber OAuth/API bridge.

## Flow

Browser / OPTIMIZE UI
-> Vercel Function
-> Jobber OAuth 2.0
-> Jobber GraphQL API

Jobber uses OAuth 2.0 authorization-code flow with PKCE. The Client Secret stays server-side. Access tokens expire after 60 minutes and refresh tokens are used to maintain the connection.

## Vercel environment variables

Set these in the Vercel project:

- `JOBBER_CLIENT_ID`
- `JOBBER_CLIENT_SECRET`
- `JOBBER_REDIRECT_URI`
- `JOBBER_SCOPES`
- `JOBBER_GRAPHQL_VERSION`
- `JOBBER_SESSION_SECRET`

Do not put the Client Secret or access/refresh tokens in HTML or client-side JavaScript.

## Jobber Developer Center

Configure the OAuth callback URL to exactly match:

`https://YOUR-VERCEL-DOMAIN.vercel.app/api/jobber/callback`

The scope string is intentionally environment-configured so it matches the permissions selected in the Jobber Developer Center.

## Endpoints

- `GET /api/jobber/auth` — begins OAuth + PKCE
- `GET /api/jobber/callback` — exchanges authorization code and creates an encrypted HttpOnly session
- `GET /api/jobber/status` — connection status
- `GET /api/jobber/data?type=snapshot` — account + first 25 clients + first 25 jobs
- `GET /api/jobber/data?type=clients`
- `GET /api/jobber/data?type=jobs`
- `POST /api/jobber/disconnect`

## MVP note

The current session is intentionally single-connection and cookie-backed so the first integration can be brought online without introducing a database dependency. For a multi-tenant commercial SaaS, move Jobber credentials into server-side persistent encrypted storage keyed by tenant/account, then add webhook ingestion and incremental sync.
