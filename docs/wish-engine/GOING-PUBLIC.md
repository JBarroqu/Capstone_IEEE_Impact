# Going public: what is still missing

The security layer for the open internet is in place (ported from the TypeScript version at git tag `public-hardening` to FastAPI): signed session cookie, rate limits, https proxy that owns `X-Forwarded-For`, signed expiring admin cookie, body caps, security headers. How to deploy it: `docs/DEPLOY.md`. What each piece does and its limits: `docs/SECURITY.md`.

These are not built, and matter once the audience is no longer a moderated study:

- **Gemini paid tier.** Free-tier prompts may be used by Google and reviewed by people, and the daily caps run out quickly with real traffic.
- **Accounts or invite links** instead of "type any name". Participant codes are names today, and anyone with the link can start a session.
- **Persistent rate-limit and health state** (Postgres or Redis), if more than one API instance runs. Today they are in memory, which is right for the single worker the compose file runs.
- **Data retention and deletion:** a way for a participant to have their data deleted, and an automatic retention window.
- **Monitoring:** error alerts, uptime checks, and a dashboard of model failure rate.
- **Abuse filtering** of free text before it reaches the model or the admin page.
- **Automated backups** off the server (the compose stack has none; `docs/DEPLOY.md` shows a manual `pg_dump`).
