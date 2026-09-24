# OPTIMIZE integration paths

The integration layer exposes the operational seams needed for the first live vertical.

## Jobber inbound
- OAuth + PKCE: /api/jobber/auth -> /api/jobber/callback
- Connection health: /api/jobber/status
- Account/clients/jobs snapshot: /api/jobber/data
- Broader sync: /api/jobber/sync?resource=all
- Individual resources: clients, jobs, quotes, requests, visits, invoices
- Opportunity Radar input: /api/jobber/opportunities
- Real-time event receiver: /api/jobber/webhook
- Disconnect: /api/jobber/disconnect

## Platform health
- /api/health

## Security
Client secrets and OAuth tokens remain server-side. Jobber recommends OAuth 2.0 rather than static API keys, requires the GraphQL version header, and supports webhooks for real-time changes. Webhooks must be authenticated with the X-Jobber-Hmac-SHA256 signature and should be acknowledged quickly before asynchronous processing.

## Next production step
Move encrypted OAuth sessions from a cookie to a durable database keyed by Jobber account ID / OPTIMIZE tenant ID. Then process webhook events idempotently and use them to invalidate/update the tenant's Opportunity Radar cache.
