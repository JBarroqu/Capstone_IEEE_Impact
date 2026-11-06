# Security

This file covers what protects the integrated app and the risks that are left. The previous Wish Engine version is in `docs/wish-engine/SECURITY.md`.

## Identity
- **Users.** Supabase Auth handles sign-up and sign-in with email and password, magic link or Google. Supabase handles password hashing, email confirmation and password reset. No module keeps passwords anymore:
  - Growth-Validation's bcrypt/JWT users are removed;
  - mike-branch's PBKDF2 users and sessions are removed.
- **Token check.** Every `/api/v1` call carries the Supabase access token. FastAPI verifies it with Supabase's public keys (JWKS, ES256/RS256), with the legacy HS256 secret as a fallback (T-04). It checks:
  - signature;
  - `iss = <SUPABASE_URL>/auth/v1`;
  - `aud = authenticated`;
  - `exp`;
  - `role = authenticated`.

  JWKS keys are cached for up to 10 minutes. The user id is `sub`, and nothing else is trusted for identity: any user id or session id in a request body is ignored.
- **Admin** is separate (D-47): `ADMIN_PASSWORD`, an HMAC-signed cookie that expires on the server after 12 h, `HttpOnly` and `SameSite=Strict`. These rules are carried over from the Wish Engine:
  - login is refused when the password is empty, `change-me` or under 8 characters;
  - login is limited to 10 tries per IP per 15 minutes;
  - changing the password signs every admin out.

## Data access
- **The browser never queries tables (T-05).** Row-level security is on for every table with no policies, so Supabase's public data API returns nothing even with a valid user token. The module schemas aren't exposed to that API either.
- FastAPI connects as the database owner. Each module's `repo.py` filters every query by the current user id, and tests check that one user can't read or change another's data. Exceptions:
  - an accepted buddy can see the evidence on the one move they were invited to (D-34, D-36);
  - the admin can see everything.
- **Storage.** The `resumes` and `evidence` buckets are private and only the API's service key can touch them. Files are read through signed URLs that last 60 seconds, issued after an access check. Resumes are deleted right after reading (D-42).
- **Secrets** (service key, database password, model keys, admin password, session secret) live only in Render env vars and `.env`. `.env` has never been committed, and the browser only receives the Supabase URL and the public (anon / publishable) key.

## Input handling
- **Body caps:** 1–64 KB per JSON route; 5 MB for resumes; 10 MB for evidence files. Uploads are size-checked while streaming, so they never all go into memory; Growth-Validation read the whole file first.
- **Uploads:** checked by size, MIME type and magic bytes. Only PDF, DOCX, TXT and common images are accepted. Files are never served from our domain.
- **Validation:** every request body is validated with pydantic, with length limits on every string and list.

## Model input and output (prompt injection)
User text reaches models in several places: wish, why, follow-up answers, profile fields, resume text, evidence summary and extracted file text. The defences:
- User text is placed inside clearly marked data sections. The system prompts say that text is data, not instructions.
- Every model output is validated against a JSON schema. Anything else is rejected and retried, then fails.
- The rubric's criteria keys are fixed to `relevance`, `completeness`, `quality` and `clarity`; other keys are dropped. **Growth-Validation inserted model-chosen keys into the page as HTML, which allowed cross-site scripting.** The integrated app renders all model text as plain text with React's escaping, never as HTML.
- The rubric is told it hasn't opened any link (Growth-Validation's rule).
- Worst case: an off-topic move, or a wrong score on the attacker's own evidence. A buddy review (D-13) then decides the final points.

## Abuse limits
In-memory token buckets (T-11), per IP, per user and global. The global limits hold even if someone fakes IPs.

| Route | Per IP | Per user | Global |
|---|---|---|---|
| options, questions, classify (model calls) | 120/min | 20/min | 300/min |
| evidence submit (model call) | 30/min | 10/min | 100/min |
| resume import (model call) | 10/min | 3/min | 30/min |
| events | 600/min | 60 batches/min | |
| user lookup | 60/min | 30/min | |
| admin login | 10 per 15 min | | |

- **Client IP** is the rightmost `X-Forwarded-For` entry added by Render's proxy (`PROXY_HOPS`, `TRUST_PROXY`). Entries a client adds itself are ignored. Check it with `/api/admin/client-ip` after deploying.
- **Username enumeration:** buddy lookup is exact-match only (D-35).

## Headers
- **Pages and API** send:
  - `Content-Security-Policy` (`default-src 'self'`; connect to `self` and the Supabase URL; `frame-ancestors 'none'`);
  - `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`;
  - HSTS in production.
- **API docs** (`/docs`) are off in production.

## Known risks (accepted for now)
- **Single worker.** Rate limits and model health are per process and reset on restart (T-11).
- **Model provider data.** On Gemini's free tier, Google may use prompts and people may review them. Use a paid key for real users, and say what is sent in the privacy text.
- **Data retention.** No automatic retention window yet. Deleting an account deletes its data (cascade).
- **Old branches.** Some module branches contain committed databases with personal data (`PROVENANCE.md`). That's the owners' call.
