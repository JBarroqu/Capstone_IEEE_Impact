# Impact++ Buddy System — minimal functional prototype

## Requirements
Python 3.9+ only. No pip, npm, Docker, or external database required.

## Start

```bash
python3 server.py
```

Open **http://127.0.0.1:8000** in a browser.

The SQLite database `buddy.sqlite3` is created automatically alongside `server.py` and persists across restarts. To reset the prototype, stop the server and delete `buddy.sqlite3` (this deletes all data).

## Test the complete Buddy workflow

1. Register account `alice_demo` with a password of at least eight characters.
2. Create a project and a milestone.
3. Log out, register `bob_demo`, then log out.
4. Log back in as `alice_demo`, open the project, search for `bob_demo`, and invite that user.
5. Log in as `bob_demo`, accept the invitation, and open the project under Projects I buddy.
6. Post feedback as Bob. Log in as Alice to see the feedback and mark milestones complete.

Use two different browser profiles (or a private window) to test both accounts concurrently.

## Data model

- `users`: registered accounts, unique case-insensitive usernames, salted PBKDF2-SHA256 password hashes.
- `sessions`: hashed random session tokens and expiration times.
- `projects`: project owner, title, description.
- `milestones`: project milestones and completion flags.
- `invitations`: one Buddy invitation per project at a time, status pending/accepted/declined.
- `feedback`: Buddy comments on a project.

SQLite foreign keys are enabled. Deleting a project cascades to milestones, invitations, and feedback. Deleting a user (not exposed in the prototype UI) cascades to their projects and relationships.

## Security and limitations

- Binds to `127.0.0.1` only; intended for **local demonstration**, not public deployment.
- Passwords are salted and hashed; sessions use random HttpOnly, SameSite=Strict cookies.
- Server enforces project ownership and accepted-Buddy authorization.
- Frontend uses DOM `textContent` for user-supplied content, avoiding HTML injection.
- No password reset, email verification, rate limiting, CSRF token, HTTPS, migrations, automated backup, or production web-server hardening.
- Run behind HTTPS with Secure cookies, CSRF protection, rate limits, and appropriate hosting infrastructure before exposing to the internet.

## API summary

- `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/users?q=...`
- `GET /api/projects`, `POST /api/projects`
- `GET /api/projects/:id`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`
- `POST /api/projects/:id/milestones`, `PATCH /api/projects/:id/milestones/:mid`, `DELETE /api/projects/:id/milestones/:mid`
- `POST /api/projects/:id/invite`, `DELETE /api/projects/:id/invite/:invitationId`
- `GET /api/invitations`, `PATCH /api/invitations/:id`
- `POST /api/projects/:id/feedback`

## Project visibility

`GET /api/projects` returns only projects owned by the logged-in account. `GET /api/buddy-projects` returns only projects for which that account has accepted a Buddy invitation. Project detail requests are independently authorized on the server: owners and accepted Buddies can view them; all other users receive HTTP 403. Pending or declined invitations do not grant access.

## Automated tests

Run the complete backend HTTP/API regression suite from the project directory:

```bash
python3 -m unittest discover -s tests -v
```

The suite uses only Python's standard library. It starts a real HTTP server on a random local port and uses a separate temporary SQLite database that is deleted after testing. Your `buddy.sqlite3` is never touched. Tests cover account registration and validation, password verification, sessions and logout with no request body, project privacy, owner/Buddy authorization, project and milestone CRUD, invitation acceptance/decline/revocation, feedback, malformed JSON, database constraints, cascades, and persistence across connections.

These are automated backend integration/regression tests using `unittest`, not browser-driven frontend tests or a production security audit. The suite can be expanded for concurrent requests, CSRF protection, and browser automation before deployment.
