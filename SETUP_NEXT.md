# OPTIMIZE next actions

The GitHub repository now contains the Vercel/Jobber integration layer and a local browser client.

Remaining external configuration is intentionally limited to account-owner actions:
- Vercel project must be connected/deployed.
- Jobber Client ID and Client Secret must be stored as Vercel environment variables.
- Jobber OAuth callback must exactly match the deployed Vercel URL.
- Jobber webhook subscriptions should point to /api/jobber/webhook after deployment.

Once those values are configured, the first live test is:
1. Open /api/health.
2. Open /api/jobber/auth and authorize OPTIMIZE in Jobber.
3. Confirm /api/jobber/status reports connected.
4. Run /api/jobber/opportunities.
5. Trigger a Jobber test event and inspect /api/jobber/webhook behavior.

Do not commit secrets, tokens, .env files, or exported credentials.
