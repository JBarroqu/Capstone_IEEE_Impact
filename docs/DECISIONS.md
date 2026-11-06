# Decision register

Every choice we made while joining the five modules into one product is listed here. Each entry is written so you can say "the way it's made is ..." and point to the exact setting that changes it.

**Module owners: please read your section.**

- If you agree, we mark the entry **Agreed**.
- If you want it different, say which alternative you want, or describe a new one. Most entries switch with one setting, and no code needs rewriting.

| Module | Branch | Owner | Section |
|---|---|---|---|
| 1 Professional State | `Professional-State` | Cfoley5 | [Profile](#profile-module-1) |
| 2 Wish & Next Move | `wish-engine` | Waleed | [Flow](#flow-wish-engine-and-growth) |
| 3 Activity, Evidence & Growth | `Growth-Validation` | Christina Phan | [Skills](#skills-module-3), [Validation and scoring](#validation-and-scoring-module-3) |
| 4 Human Roles & Social Support | `mike-branch` | Michael Hawes | [Buddies](#buddies-module-4) |
| 5 Opportunity & Event Return | `Event_Ecosystem` | JBarroqu | [Feed and Home](#feed-and-home-module-5) |

## How switching works

Every switchable decision has one **policy key**, for example `VALIDATION_MODE`. A policy's value is decided in three layers, and the later ones win:

1. **Default:** set in `backend/app/policies/defaults.py`. This is the only place defaults live. Each entry there names its decision ID (`D-13`) and links back to this file.
2. **Environment variable:** an env var with the same name, for example `VALIDATION_MODE=ai_only` on Render. It takes effect on the next deploy.
3. **Admin page:** a live toggle at `/admin` → Policies, stored in the database. It takes effect within 30 seconds, with no deploy. The whole admin layer can be turned off with `POLICY_ADMIN_EDIT=false`.

**How the code stays switchable**

- Each decision that changes behaviour is a small strategy class with one implementation per choice. Examples: `ValidationStrategy` with `AiThenBuddy`, `AiOnly` and `BuddyRequired`; `UnlockMatch` with `AtLeast` and `Exact`.
- The rest of the code asks for the current strategy and never checks raw strings. So adding a new alternative means adding one class.
- Every strategy's docstring starts with its decision ID, so `grep -rn "D-13" backend/` finds the code behind an entry.

**History is never rewritten.** Every points entry stores the scoring rules version and a snapshot of the policies in force when it was written. Switching a policy changes what happens from then on. Past points keep the rules they were earned under.

**Tests keep the alternatives working.**

- A test runs every choice of every strategy, so the alternatives below are tested code, not just ideas.
- A second test fails if this file and `defaults.py` list different keys.

**Status values:**

- **Proposed:** chosen during integration, waiting for the owner.
- **Agreed:** the owner confirmed it.
- **Changed:** the owner picked something else. The change log at the bottom records it.

---

## Flow (Wish Engine and Growth)

### D-01 Profile before Home
- **The way it's made:** after signing up, you complete your professional state before you can use the rest of the app.
- **Why:** the Wish Engine uses the profile to fit its moves to you. Without one, the first moves are generic.
- **Alternatives:** make onboarding optional and show a "complete your profile" reminder on Home.
- **Switch:** `ONBOARDING_REQUIRED` = **true** | false
- **Owner:** Cfoley5, Waleed · **Status:** Proposed

### D-02 One move at a time
- **The way it's made:** for each wish you pick one move, do it, and submit evidence. The next move is generated after that, using how the first one went.
- **Why:** later moves can build on real results, and the growth module scores one thing at a time.
- **Alternatives:** plan a 3-move path up front. The Wish Engine already supports this.
- **Switch:** `MOVES_PER_WISH` = **1** | 3
- **Owner:** Waleed · **Status:** Proposed (chosen with the integration lead)

### D-03 When the next move opens
- **The way it's made:** the next move for a wish opens once the previous move's evidence is validated (final points awarded).
- **Why:** validated evidence carries the most information into the next move's prompt.
- **Alternatives:**
  - `ai_scored`: opens as soon as the rubric has scored it.
  - `submitted`: opens as soon as evidence is in.
  - `none`: you can ask for the next move at any time.
- **Switch:** `NEXT_MOVE_GATE` = **validated** | ai_scored | submitted | none
- **Owner:** Waleed, Christina Phan · **Status:** Proposed

### D-04 Options per step
- **The way it's made:** each step shows 3 move options. You can reject them with a reason and get a different set.
- **Alternatives:** 2 options.
- **Switch:** `OPTIONS_PER_STEP` = **3** | 2
- **Owner:** Waleed · **Status:** Proposed

### D-05 Moves per wish
- **The way it's made:** a wish can have at most 5 moves. After that it is marked complete.
- **Switch:** `MAX_STEPS_PER_WISH` = **5** (any number from 1 to 10)
- **Owner:** Waleed · **Status:** Proposed

### D-53 Active wishes
- **The way it's made:** you can have any number of active wishes. Each has at most one open move.
- **Alternatives:** a limit (for example 1 or 3) to keep the dashboard focused.
- **Switch:** `MAX_ACTIVE_WISHES` = **0 (unlimited)** | any number
- **Owner:** Waleed · **Status:** Proposed (chosen with the integration lead)

### D-06 What of your profile the move generator sees
- **The way it's made:** the moves prompt includes a summary of your profile: target career, major, position, skills, interests, strengths, growth areas, and your current skill tiers. Your name, bio and school name are never sent to the model.
- **Why:** the summary is what personalises moves. Names and free-text bios add little and are personal data.
- **Alternatives:**
  - `full`: also send headline, bio and featured contributions.
  - `off`: don't send the profile (behaves like the original Wish Engine).
- **Switch:** `PROFILE_IN_MOVES` = **summary** | full | off
- **Owner:** Cfoley5, Waleed · **Status:** Proposed

### D-07 The next move knows how the last one went
- **The way it's made:** when generating move 2 and later, the prompt includes the previous move's outcome: the rubric score, a short summary of its feedback, and the buddy's comment.
- **Alternatives:** off (each move only sees the wish and the profile).
- **Switch:** `NEXT_MOVE_CONTEXT` = **outcomes** | off
- **Owner:** Waleed, Christina Phan · **Status:** Proposed

### D-11 Who decides a move's activity type, difficulty and skill
- **The way it's made:** the model tags every generated move with an activity type, a difficulty and the target skill (see the lists below). Growth scoring uses those tags. You can't change them when you submit evidence.
  - Activity types: explore, create, test, share, connect, enable.
  - Difficulties: easy, moderate, hard.
  - Target skill: one skill from your career's list.
- **Why:** in Growth-Validation, users picked their own type and difficulty, so anyone could claim "create, hard" for anything and get the most points.
- **Alternatives:** `user`, Growth-Validation's original behaviour, where you choose the tags at evidence time.
- **Switch:** `MOVE_TAGS_SOURCE` = **model** | user
- **Owner:** Christina Phan, Waleed · **Status:** Proposed

### D-12 The rubric may adjust difficulty
- **The way it's made:** the evidence rubric can move a move's difficulty up or down by one level based on what you actually submitted. This is Growth-Validation's rule, unchanged.
- **Switch:** `AI_DIFFICULTY_ADJUST` = **one_level** | off
- **Owner:** Christina Phan · **Status:** Proposed

### D-29 Every move is generated
- **The way it's made:** all moves come from the Wish Engine's model. Growth-Validation's 7 hand-written moves (all for data analysts) are not used.
- **Why:** this is a core rule of the Wish Engine (no fixed catalogue of moves), and the hand-written moves only covered one career.
- **Switch:** none. This is a design rule.
- **Owner:** Waleed, Christina Phan · **Status:** Proposed

---

## Skills (Module 3)

### D-08 Skills come from a career taxonomy
- **The way it's made:** there is a fixed list of target careers, each with its own skill list, some marked "core". You choose a target career in your profile. Every move is tagged with one skill from that career's list, and growth is tracked per skill.
- **Why:** it keeps Growth-Validation's tiers, role tier and unlocks working as designed, and makes progress comparable between users.
- **Alternatives:** `freeform`, where skills are whatever you typed in your profile. That is more flexible, but names are inconsistent ("JS" vs "JavaScript"), there are no core skills, and role tier doesn't apply.
- **Switch:** `SKILL_MODEL` = **taxonomy** | freeform
- **Owner:** Christina Phan · **Status:** Proposed (chosen with the integration lead)

### D-09 Where the taxonomy lives
- **The way it's made:** one file, `data/catalog.json`, holds the careers, their skills and the opportunities. It starts from Growth-Validation's four careers: data analyst, software engineer, UX designer, cybersecurity. Adding a career means editing that file.
- **Alternatives:** a database table with an admin editor.
- **Switch:** `CATALOG_PATH` (which file to load)
- **Owner:** Christina Phan · **Status:** Proposed

### D-10 One target career
- **The way it's made:** you have one target career at a time. If you change it, points already earned stay with their skills.
- **Alternatives:** several careers at once.
- **Switch:** none (documented choice)
- **Owner:** Christina Phan, Cfoley5 · **Status:** Proposed

---

## Validation and scoring (Module 3)

All constants below are Growth-Validation's, unless an entry says it fixes a bug. They live in one `ScoringRules` object with a version number:

- `v1.0` is Growth-Validation exactly, kept for reference and tests.
- `v1.1` is the integration default.

The differences are listed in `docs/SCORING.md`.

### D-13 How evidence is validated
- **The way it's made:**
  1. When you submit evidence, the rubric scores it right away. You see **pending** points.
  2. The buddy you invited on that move rates it (1 to 5) and confirms it.
  3. That confirmation becomes social evidence, and your points are finalised using Growth-Validation's mix of rubric score and reviewer rating.
- **Why:** you get feedback immediately, and a real person still confirms the work. This replaces Growth-Validation's simulated reviewers, whose rating only copied the rubric score.
- **Alternatives:**
  - `ai_only`: the rubric score alone finalises points. Buddy feedback is shown but doesn't change points.
  - `buddy_required`: no points at all until a buddy reviews. The rubric only gives written feedback.
- **Switch:** `VALIDATION_MODE` = **ai_then_buddy** | ai_only | buddy_required
- **Owner:** Christina Phan, Michael Hawes · **Status:** Proposed (chosen with the integration lead)

### D-18 No buddy review within 7 days
- **The way it's made:** if no buddy confirms within 7 days, the evidence finalises on the rubric score alone and is marked "not peer-confirmed".
- **Why:** nobody gets stuck waiting on someone else.
- **Alternatives:** any other number of days, or `0` for never: points stay pending until a buddy reviews.
- **Switch:** `BUDDY_TIMEOUT_DAYS` = **7** | any number | 0 (never)
- **Owner:** Christina Phan, Michael Hawes · **Status:** Proposed (chosen with the integration lead)

### D-14 How much a buddy's rating counts
- **The way it's made:** a reviewer's weight comes from their own tier in your career: Proficient 0.8, Demonstrated 1.0, Verified 1.2. This is Growth-Validation's weights. The weight is never below Proficient (0.8), so new users can still review.
- **Alternatives:** `fixed`, where every buddy counts at one set tier.
- **Switch:** `BUDDY_TIER_SOURCE` = **role_tier** | fixed, and `BUDDY_FIXED_TIER` = Proficient
- **Owner:** Christina Phan · **Status:** Proposed

### D-15 Final quality formula
- **The way it's made:** final quality `q` mixes the rubric score `a` and the reviewer score `r`:
  - `q = 0.2a + 0.8r` if the rubric's confidence is below 0.5;
  - `q = 0.4a + 0.6r` otherwise.

  This is Growth-Validation's formula, unchanged. With `ai_only`, `q = a`.
- **Switch:** `SCORING_RULES` = **v1.1** | v1.0 (the constants live in `ScoringRules`)
- **Owner:** Christina Phan · **Status:** Proposed

### D-16 Pass bar
- **The way it's made:** if `q` is below 0.5, the evidence is marked **needs work** and earns no validated points.
- **Switch:** `ScoringRules.pass_bar`
- **Owner:** Christina Phan · **Status:** Proposed

### D-17 Pending points don't count toward tiers
- **The way it's made:** pending points (scored by the rubric but not yet final) appear on your growth page. They don't count toward tiers or unlocks until they are final.
- **Alternatives:** count them straight away.
- **Switch:** `PROVISIONAL_COUNTS` = **false** | true
- **Owner:** Christina Phan · **Status:** Proposed

### D-19 Buddy doesn't confirm
- **The way it's made:** if your buddy rates the evidence but doesn't confirm it, it goes to **needs work**. You can submit a revision, and it goes back to the same buddy.
- **Switch:** none
- **Owner:** Christina Phan, Michael Hawes · **Status:** Proposed

### D-20 Effort points
- **The way it's made:** these are Growth-Validation's constants, unchanged:
  - doing a move earns 3 effort points;
  - effort is capped at 20 points per week;
  - effort can make up at most about 30% of your Impact Score: counted effort ≤ max(30, 3/7 × validated points).
- **Switch:** `ScoringRules`
- **Owner:** Christina Phan · **Status:** Proposed

### D-21 Effort is earned once per move (bug fix)
- **The way it's made:** effort points are earned once per selected move, not once per submission. A submission that failed because of a model error earns nothing.
- **Why:** in Growth-Validation, every submission earned effort, including failed ones, so resubmitting the same thing farmed points.
- **Alternatives:** `per_submission` (Growth-Validation's original).
- **Switch:** `EFFORT_RULE` = **per_move_once** | per_submission
- **Owner:** Christina Phan · **Status:** Proposed

### D-22 Repeats are worth less
- **The way it's made:** repeating the same skill and activity type within 30 days earns less. The multiplier is 0.7^(n−1), never below 0.2. This is Growth-Validation's rule, unchanged.
- **Switch:** `DECAY_ENABLED` = **true** | false, with constants in `ScoringRules`
- **Owner:** Christina Phan · **Status:** Proposed

### D-23 Tiers
- **The way it's made:** these are Growth-Validation's thresholds and gates, unchanged:
  - **Familiar:** 30 points.
  - **Proficient:** 100 points, and at least 2 validated pieces of evidence.
  - **Demonstrated:** 250 points, at least one validated "hard" piece of evidence, and a reviewer who is Demonstrated or above.
  - **Verified:** 500 points (see D-24).
- **Switch:** `ScoringRules`
- **Owner:** Christina Phan · **Status:** Proposed (see open question Q1)

### D-24 Verified needs an admin endorsement
- **The way it's made:** reaching Verified needs an admin endorsement as well as the points. Growth-Validation capped everyone at Demonstrated for the same reason.
- **Alternatives:** `points`, where the points alone are enough.
- **Switch:** `VERIFIED_REQUIRES` = **admin_endorsement** | points
- **Owner:** Christina Phan · **Status:** Proposed

### D-25 Unlocks open at a tier or above (bug fix)
- **The way it's made:** an opportunity unlocks when any of your skills reaches **at least** the opportunity's tier.
- **Why:** Growth-Validation only unlocked when a skill was **exactly** at that tier. So reaching Demonstrated could skip the Proficient unlocks.
- **Alternatives:** `exact` (Growth-Validation's original).
- **Switch:** `UNLOCK_MATCH` = **at_least** | exact
- **Owner:** Christina Phan · **Status:** Proposed

### D-26 Unlocks are permanent
- **The way it's made:** once unlocked, an opportunity stays unlocked.
- **Alternatives:** take it back if points are later reversed.
- **Switch:** `UNLOCK_REVOKE` = **never** | on_reversal
- **Owner:** Christina Phan · **Status:** Proposed

### D-27 Opportunities
- **The way it's made:** the opportunities and their kinds are kept as Growth-Validation defined them, and live in `data/catalog.json`.
  - Opportunities: study group, peer reviewer, mentor match, recruiter visibility, partner brief, IEEE nomination, IEEE certificate.
  - Kinds: real, seeded, flag, display.
- **Switch:** `CATALOG_PATH`
- **Owner:** Christina Phan · **Status:** Proposed (see open question Q2)

### D-28 Role tier
- **The way it's made:** your role tier is the highest tier that at least 60% of your career's core skills have reached. This is Growth-Validation's rule, unchanged.
- **Switch:** `ScoringRules.role_ratio`
- **Owner:** Christina Phan · **Status:** Proposed

### D-48 The evidence rubric
- **The way it's made:** these are Growth-Validation's rubric and safeguards, unchanged:
  - The model scores relevance, completeness, quality and clarity, each from 0 to 1.
  - The overall score is their average.
  - Temperature is 0.
  - The model is told it hasn't opened any link.

  The one change is that it now runs through the shared model chain (T-10) instead of its own Gemini client.
- **Switch:** `RUBRIC_VERSION` = **rubric.v1**
- **Owner:** Christina Phan · **Status:** Proposed

### D-49 Scoring runs in the background
- **The way it's made:** submitting evidence returns at once, and the rubric scores it in the background. If the model fails, the evidence is marked for retry. This is Growth-Validation's behaviour.
- **Switch:** `JOBS_BACKEND` = **inprocess**
- **Owner:** Christina Phan · **Status:** Proposed

---

## Buddies (Module 4)

These are Michael Hawes's buddy rules from `mike-branch`. The one structural change: you invite a buddy onto a **selected move** instead of onto a hand-made project.

### D-30 Two buddy roles
- **The way it's made:** there are two roles:
  - **Reviewer:** rates and confirms your evidence, which counts toward points.
  - **Tester:** tries what you made and leaves written feedback. This is shown to you but doesn't change points.
- **Why:** these are the two roles in the backbone diagram, and the original branch had one generic "buddy".
- **Alternatives:** reviewer only, or testers' feedback also counts.
- **Switch:** `BUDDY_ROLES` = **reviewer,tester**, and `TESTER_COUNTS` = **false** | true
- **Owner:** Michael Hawes · **Status:** Proposed

### D-31 One buddy per role per move
- **The way it's made:** each move can have one accepted buddy per role. This is the original one-buddy-per-project rule.
- **Switch:** `BUDDIES_PER_MOVE` = **1** | any number
- **Owner:** Michael Hawes · **Status:** Proposed

### D-32 Buddies join a move, not a project
- **The way it's made:** you invite a buddy onto a move you selected. Your evidence revisions for that move go to the same buddy. The original projects and milestones are replaced by the move and its evidence.
- **Switch:** none
- **Owner:** Michael Hawes · **Status:** Proposed

### D-33 Re-inviting
- **The way it's made:** you can't invite the same person to the same move twice, even after they decline. This is the original rule. You can invite someone else.
- **Alternatives:** allow re-inviting after a decline.
- **Switch:** `REINVITE_AFTER_DECLINE` = **false** | true
- **Owner:** Michael Hawes · **Status:** Proposed

### D-34 Who can leave feedback
- **The way it's made:** only the buddy who accepted can leave feedback, and you can't review your own move. These are the original rules.
- **Switch:** none
- **Owner:** Michael Hawes · **Status:** Proposed

### D-35 Finding a buddy
- **The way it's made:** you invite someone by their exact handle or email.
- **Why:** the original prefix search let any user list every username.
- **Alternatives:** `prefix` search (the original).
- **Switch:** `BUDDY_DISCOVERY` = **exact** | prefix
- **Owner:** Michael Hawes · **Status:** Proposed

### D-36 Buddies can open your evidence file
- **The way it's made:** your accepted buddy can open your evidence file through a link that works for 60 seconds. Files are never public.
- **Switch:** none
- **Owner:** Michael Hawes, Christina Phan · **Status:** Proposed

### D-37 Reviewing earns nothing (for now)
- **The way it's made:** reviewing someone else's move doesn't earn you points.
- **Alternatives:** reviewers earn effort points.
- **Switch:** `REVIEWER_EARNS` = **none** | effort
- **Owner:** Michael Hawes, Christina Phan · **Status:** Proposed (see open question Q3)

---

## Feed and Home (Module 5)

Home uses the Event_Ecosystem layout: profile and Impact Score on the left, notifications on the right. It is the design for the whole app.

### D-38 What creates a notification
- **The way it's made:** these events create notifications, using Event_Ecosystem's six categories:

  | Event | Category |
  |---|---|
  | Move locked, next move ready | Pro |
  | Evidence scored, tier reached | Growth |
  | Points validated | Impact |
  | Buddy invited you, accepted, left feedback | Social |
  | Opportunity unlocked | Enablement |
  | (reserved for external events) | Events |
- **Switch:** the mapping lives in `backend/app/policies/notifications.py`. Any kind can be turned off with `NOTIFY_DISABLED` = comma-separated kinds.
- **Owner:** JBarroqu · **Status:** Proposed

### D-39 While You Were Away
- **The way it's made:** "While You Were Away" shows notifications created since your previous visit.
- **Alternatives:** the last N days.
- **Switch:** `WYWA_MODE` = **since_last_visit** | days:7
- **Owner:** JBarroqu · **Status:** Proposed

### D-40 Best next move
- **The way it's made:** Home shows one "best next move", the first match in this order:
  1. A buddy review someone requested from you.
  2. Evidence that needs work.
  3. Evidence to submit.
  4. Invite a buddy.
  5. Next move ready.
  6. Start a wish.
  7. Complete your profile.
- **Switch:** the order list in `backend/app/modules/feed/next_move.py`
- **Owner:** JBarroqu · **Status:** Proposed

### D-41 External events
- **The way it's made:** detecting outside events (career fairs, IEEE events) is not built yet. The Events category is reserved for it.
- **Switch:** `EVENT_SOURCES` = **none**
- **Owner:** JBarroqu · **Status:** Proposed (see open question Q4)

### D-50 Home filter chips
- **The way it's made:** Event_Ecosystem's chips are kept and filter these categories:
  - People → Social and Pro
  - Opportunity → Enablement and Events
  - Impact → Impact
  - Growth → Growth
  - Enablement → Enablement
  - Social → Social
- **Switch:** `backend/app/modules/feed/rules.py`
- **Owner:** JBarroqu · **Status:** Proposed

---

## Profile (Module 1)

### D-42 Resume import
- **The way it's made:** during onboarding you can upload a resume (PDF or DOCX, up to 5 MB) to pre-fill your profile. The file is deleted as soon as it has been read.
- **Alternatives:** turn import off, or keep the file.
- **Switch:** `PROFILE_IMPORT` = **on** | off, `RESUME_MAX_MB` = **5**, `RESUME_RETENTION` = **delete** | keep
- **Owner:** Cfoley5 · **Status:** Proposed (chosen with the integration lead)

### D-43 How a resume is read
- **The way it's made:**
  1. The text is extracted from the file on our server.
  2. One model call turns it into a **draft** profile.
  3. You review and edit the draft. Nothing is saved until you confirm.

  Scanned images are not read (no OCR).
- **Switch:** `RESUME_PROMPT` = **resume.v1**
- **Owner:** Cfoley5 · **Status:** Proposed

### D-44 Profile fields
- **The way it's made:** these are the fields from the `Professional-State` branch, with five changes:
  - **Kept:** name, headline, bio, education, position, skills, interests, featured contributions, growth areas.
  - **Added:** **strengths** (from the backbone diagram), **target career** (D-08) and a **handle** (D-51).
  - **Fixed:** the fake "Alex Morgan" defaults are removed.
  - **Fixed:** users can no longer mark their own contributions "verified".
- **Switch:** none
- **Owner:** Cfoley5 · **Status:** Proposed

### D-45 Validated evidence on your profile
- **The way it's made:** when evidence is validated, you are *offered* to add it to your featured contributions as "verified". It isn't added automatically.
- **Alternatives:** `auto` (added automatically) or `off`.
- **Switch:** `CONTRIBUTION_FROM_EVIDENCE` = **suggest** | auto | off
- **Owner:** Cfoley5, Christina Phan · **Status:** Proposed

### D-51 Handle
- **The way it's made:** you choose a unique handle during onboarding, so buddies can invite you without knowing your email.
- **Switch:** `HANDLE_REQUIRED` = **true** | false
- **Owner:** Cfoley5, Michael Hawes · **Status:** Proposed

---

## Admin and analytics

### D-46 Analytics kept, study mechanics dropped
- **The way it's made:** the Wish Engine's event log and admin analytics are kept, keyed by your account instead of a typed name. These are dropped:
  - typed participant names;
  - the consent screen;
  - "delete TEST sessions";
  - the end-of-flow survey screens.
- **Alternatives:** bring the survey screens back.
- **Switch:** `SURVEY_SCREENS` = **off** | on
- **Owner:** Waleed · **Status:** Proposed (chosen with the integration lead)

### D-47 Admin login
- **The way it's made:** admin uses its own password (`ADMIN_PASSWORD`), separate from user accounts, with a signed cookie that expires after 12 hours. This is the Wish Engine's existing admin.
- **Alternatives:** an admin flag on a normal user account.
- **Switch:** none
- **Owner:** Waleed · **Status:** Proposed (chosen with the integration lead)

### D-52 Policies editable on the admin page
- **The way it's made:** every policy in this file can be changed live on the admin page.
- **Switch:** `POLICY_ADMIN_EDIT` = **true** | false
- **Owner:** Waleed · **Status:** Proposed (chosen with the integration lead)

---

## Technical decisions

These change how the system is built, not how it behaves for users. Details are in `docs/ARCHITECTURE.md`.

| ID | The way it's made | Alternatives | Switch |
|---|---|---|---|
| T-01 | One FastAPI app with one package per module. Modules call each other only through a small `api.py` per module, using the versioned contracts. A CI check (`import-linter`) enforces this. | separate services | none |
| T-02 | Contracts (ProfessionalState, SelectedMove, GrowthState, SocialEvidence, FeedItem, EventContext, BestNextMoveTrigger) are versioned pydantic models, exported to JSON Schema and TypeScript. | untyped JSON | none |
| T-03 | The FastAPI service also serves the React build, so pages and API share one address. Two `onrender.com` subdomains would count as different sites and break the admin cookie. | separate static site with a `/api` rewrite, or cross-origin calls | `SERVE_SPA`, `VITE_API_BASE`, `CORS_ORIGINS` |
| T-04 | The API checks Supabase sign-in tokens with Supabase's public keys (JWKS). The legacy shared secret is supported as a fallback. | shared secret only | `SUPABASE_JWT_MODE` = **jwks** \| secret |
| T-05 | The browser talks to Supabase only to sign in. All data goes through the API. | browser reads tables directly with row-level security | none |
| T-06 | One Postgres schema per module (`profile`, `wish`, `growth`, `social`, `feed`, `core`). Row-level security is on with no policies, so nothing is reachable except through the API. | one shared schema | none |
| T-07 | Database changes are Supabase CLI SQL migrations in `supabase/migrations`. | Alembic | none |
| T-08 | All ids are UUIDs, and the user id is Supabase's `auth.users.id`. This replaces Growth-Validation's integers and Professional-State's `demo-user`. | none | none |
| T-09 | Uploads (resumes, evidence) go to private Supabase Storage buckets through the API, which checks type and size. Files are read through 60-second signed links. Growth-Validation's local `uploads/` folder is lost on every Render restart. | direct browser upload with signed upload URLs | `UPLOAD_PATH` = **proxy** \| signed_url |
| T-10 | One model chain for everything: moves, questions, classification, resume reading, the evidence rubric. It is the Wish Engine's chain: Gemini models discovered and ranked, failover to Groq, OpenRouter or local Ollama, cooldowns, and an admin "try first" setting. | each module keeps its own client | `LLM_PROVIDER` = **auto** \| gemini \| groq \| openrouter \| ollama |
| T-11 | The API runs as one worker process. Model health, rate limits and background jobs live in memory. | move that state to Postgres or Redis before scaling out | none |
| T-12 | Modules announce events (for example "move selected") in-process after each database commit, and the feed turns them into notifications. A repeated event never creates a second notification. | a message queue | none |
| T-13 | Analytics events are sent with the user's token. On page close, a short-lived signed ticket is used instead, because the browser can't attach a token there. | none | none |
| T-14 | Growth state (points, tiers, unlocks) is computed from the points ledger when read. Reading never writes; Growth-Validation's dashboard wrote on every view. | stored totals | none |
| T-15 | All routes are under `/api/v1`. Errors keep the Wish Engine's shape, `{ok:false, error}` with HTTP 400 rather than 422. | none | none |
| T-16 | Sign-in emails (magic links, confirmations) use Supabase's built-in email in development and a real email provider in production. | none | see open question Q5 |

---

## Open questions

Each has a provisional default so work isn't blocked.

| # | Question | For | Provisional default |
|---|---|---|---|
| Q1 | Demonstrated needs a reviewer who is already Demonstrated or above (D-23). Early on almost nobody is. Should admins be able to mark mentors, or should the gate be relaxed? | Christina Phan | Admin-marked mentors count as Demonstrated reviewers. |
| Q2 | Should the "Peer reviewer" unlock (Proficient) control who may act as a Reviewer buddy? That would tie modules 3 and 4 together. | Christina Phan, Michael Hawes | No: anyone can be a reviewer. |
| Q3 | Should reviewing others earn points (D-37)? | Michael Hawes, Christina Phan | No. |
| Q4 | Before external events exist, should the Events chip be hidden or shown empty? | JBarroqu | Shown, with an empty state. |
| Q5 | Which email provider sends magic links in production, and who creates the Google sign-in client? | team | Decided before launch. |
| Q6 | Render's free web services sleep after 15 minutes, and Supabase free projects pause after a week idle. Is that fine for demos? | team | Free tier for development. |
| Q7 | If real students use the app, does the class or an IRB still require a consent step? | team | No consent screen (D-46). |

## Change log

| Date | Entry | Change | By |
|---|---|---|---|
| 2026-11-05 | all | Register created, all entries Proposed | Waleed (integration) |
