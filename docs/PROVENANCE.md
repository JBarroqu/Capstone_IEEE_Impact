# Provenance

This file records where integrated code came from, at which commit, and what was left behind.

**How the `integration` branch was made:**
- It was branched from `wish-engine`, so the Wish Engine's history continues.
- The other modules were ported by hand from these commits. Their branches are never merged, because their file trees conflict.
- The module branches stay untouched as the record of each person's work.

| Module | Branch | Commit | Author |
|---|---|---|---|
| 1 Professional State | `Professional-State` | `8e3fbfe` | Cfoley5 |
| 2 Wish & Next Move | `wish-engine` | `86aa71f` | Waleed |
| 3 Activity, Evidence & Growth | `Growth-Validation` | `c657bab` | Christina Phan |
| 4 Human Roles & Social Support | `mike-branch` | `402939b` | Michael Hawes |
| 5 Opportunity & Event Return | `Event_Ecosystem` | `6fd258c` | JBarroqu |

Read any source file with `git show <commit>:<path>`.

## File map

This table is filled in as code is ported: one row per ported file, with its source path, commit and destination.

| Destination | Source | Notes |
|---|---|---|
| (Phase 1+) | | |

## Left behind, with reasons
- **Event_Ecosystem**
  - `vite.config.ts`'s five Figma Make plugins, the `.figma/make/site.json` import, and the `figma:*` slots in `index.html`: editor tooling.
  - The fake font faces: Figma-only URLs.
  - 11 unused SVGs.
- **Growth-Validation**
  - The duplicate tree: the root files repeat the contents of `ieee-impact-plus-main.zip`. The zip's `backend/app` layout is the source of truth.
  - The file named `download`, which is a `.gitignore`.
  - `pages.yml`: GitHub Pages deploy.
  - The static `MOVES` list: see D-29.
  - Simulated reviewers: see D-13.
  - The own auth.
  - The unused `UserBadge`, `EvidenceIn` and Pillow.
- **mike-branch**
  - The stdlib HTTP server, projects and milestones (D-32), and the own auth.
  - `__pycache__`.
- **Professional-State**
  - The JSON-blob storage, the `demo-user` routes and the fake defaults.
  - `__pycache__` and the `Zone.Identifier` files.
- **wish-engine**
  - The Next.js app, the participant/consent study flow (D-46), `docker-compose*.yml` and `Caddyfile.public`. Render + Supabase replace them.
  - The old docs moved to `docs/wish-engine/`.

## Note for branch owners: personal data in the public repo
The repository is public. Two branches have committed database files that hold personal data. We have **not** rewritten anyone's history; each owner decides what to do.

| Branch | File | Contents |
|---|---|---|
| `Professional-State` | `backend/professional_state.db` | one profile row with what looks like a real full name and a short bio |
| `mike-branch` | `buddy.sqlite3` | two usernames (one looks like a real handle), their PBKDF2 password hashes, and one unexpired session hash |

**Options for owners:**
1. Delete the file in a new commit. It stays visible in history.
2. Rewrite the branch history and force-push.

If any password in `buddy.sqlite3` is used anywhere else, change it. No API keys or secrets were found on any branch, including inside the Growth-Validation zip.
