# Decisions for module owners to review

The integrated app was built from your branch, and in a few places it now works differently from what you built or intended. Some of these are new rules you didn't have. **This page lists only those places.** Everything else was carried over as you made it, and is described in `docs/modules/<your module>.md`.

Each entry says what you did, what the integrated app does instead, and why.
- If the entry has a **setting**, you can switch to an alternative without code changes.
- If you'd like something different, reply with the entry ID and your choice. We'll switch it and mark the entry **Changed**. Otherwise we mark it **Agreed**.

| Module | Owner | Section |
|---|---|---|
| 1 Professional State | Cfoley5 | [Profile](#module-1-professional-state-cfoley5) |
| 2 Wish & Next Move | Waleed | [Wish](#module-2-wish--next-move-waleed) |
| 3 Activity, Evidence & Growth | Christina Phan | [Growth](#module-3-activity-evidence--growth-christina-phan) |
| 4 Human Roles & Social Support | Michael Hawes | [Buddies](#module-4-human-roles--social-support-michael-hawes) |
| 5 Opportunity & Event Return | JBarroqu | [Feed and Home](#module-5-opportunity--event-return-jbarroqu) |

## How a setting is changed

Every setting named below is a key in `backend/app/policies/defaults.py`. The default is what the app does today. You can override it in two places, and the admin page wins if both are set:

- **Environment variable:** an env var with the same name, for example `VALIDATION_MODE=ai_only`. It takes effect on the next deploy.
- **Admin page:** the **Policies** page in `/admin` toggles it live, with no deploy.

Changing a setting only affects what happens from then on. Points already earned keep the rules they were earned under.

## Platform changes that apply to every module

These come from merging five separate apps into one. They aren't up for per-module choice, but you should know about them.

| What your branch had | What the integrated app does |
|---|---|
| Its own login (Growth-Validation's JWT, mike-branch's sessions) or none (Professional-State, Event_Ecosystem) | One Supabase sign-in: email and password, magic link, or Google |
| SQLite, or its own Postgres | One Supabase Postgres, one schema per module |
| Its own server | One FastAPI app; each module is a package that talks to the others only through versioned contracts (`docs/CONTRACTS.md`) |
| Its own frontend style | Event_Ecosystem's design everywhere (`docs/DESIGN.md`) |
| Its own model client (Growth-Validation: Gemini SDK) | The Wish Engine's shared model chain, with failover between models |
| Files on local disk (Growth-Validation `uploads/`) | Private Supabase Storage |

---

## Module 1: Professional State (Cfoley5)

### D-01 Profile is required before Home (new)
- **Before:** there was no flow; the profile was a standalone API.
- **Now:** after sign-up you must complete your profile before using the rest of the app.
- **Why:** the Wish Engine uses the profile to fit moves to you.
- **Setting:** `ONBOARDING_REQUIRED` = **true** | false (false shows a "Finish your profile" reminder at the top of Home instead)

### D-42, D-43 Resume import (new)
- **Before:** you filled the form by hand.
- **Now:** you can upload a PDF or DOCX (up to 5 MB) during onboarding.
  - The text is extracted, and one model call turns it into a **draft** profile.
  - You review and edit the draft; nothing is saved until you confirm.
  - The file is deleted right after it is read. Scanned images aren't read.
- **Settings:** `PROFILE_IMPORT` = **on** | off · `RESUME_RETENTION` = **delete** | keep · `RESUME_MAX_MB` = **5**

### D-44 Field changes
- **Before:** `name`, `headline`, `bio`, `education`, `position`, `skills`, `interests`, `featuredContributions`, `growthAreas`. Missing fields defaulted to a sample person ("Alex Morgan"), and the client could set a contribution to `verified`.
- **Now:**
  - **added** `strengths` (it's in the backbone diagram) and `targetCareerId` (see D-08);
  - **removed** the sample defaults, so an empty field stays empty;
  - **only the server** can mark a contribution `verified`, when it is linked to validated evidence.
- **Setting:** none

### D-51 Handle (new)
- **Before:** there was no handle.
- **Now:** you choose a unique handle during onboarding so buddies can invite you without knowing your email.
- **Setting:** `HANDLE_REQUIRED` = **true** | false

### D-45 Validated evidence on your profile (new)
- **Now:** when evidence is validated in Module 3, the evidence card offers "Add to profile", which adds it to your featured contributions as verified.
- **Setting:** `CONTRIBUTION_FROM_EVIDENCE` = **suggest** | auto (added without asking) | off

### D-06 What of the profile the move generator sees (new)
- **Now:** the Wish Engine's prompt gets a summary of your profile:
  - target career, major and position;
  - skills, interests, strengths and growth areas;
  - your current skill tiers.

  Name, bio and school name are never sent to the model.
- **Setting:** `PROFILE_IN_MOVES` = **summary** | full (adds headline, bio, contributions) | off

---

## Module 2: Wish & Next Move (Waleed)

### D-02, D-03 One move at a time, gated on validation
- **Before:** quick mode picked one move and ended in a rating survey; the full mode picked 3 moves up front.
- **Now:**
  1. You pick one move, do it, and submit evidence.
  2. The next move for that wish opens once that evidence is **validated**.
  3. The next move is generated with that result in mind.
- **Settings:** `MOVES_PER_WISH` = **1** | 3 · `NEXT_MOVE_GATE` = **validated** | ai_scored | submitted | none

### D-07 The next move knows how the last one went (new)
- **Now:** from move 2, the prompt includes the previous move's rubric score, a short summary of its feedback, and the buddy's comment.
- **Setting:** `NEXT_MOVE_CONTEXT` = **outcomes** | off

### D-11 Moves are tagged for scoring (new)
- **Now:** besides title, detail, minutes, cost and format, the model tags every move with:
  - an **activity type**: explore, create, test, share, connect or enable;
  - a **difficulty**: easy, moderate or hard;
  - a **skill** from your target career.

  Module 3 scores with these tags.
- **Setting:** `MOVE_TAGS_SOURCE` = **model** | user

### D-46 Study mechanics removed
- **Before:** typed participant names, a consent screen, "delete TEST sessions", and the survey after the path: a 1–5 rating (quick mode stopped there), then "would you do move 1 this week", "would you pay" for each paid option shown, and open feedback.
- **Now:** the event log and admin analytics stay, keyed by the signed-in user. Names, consent and TEST deletion are removed; the survey is off.
- **Setting:** `SURVEY_SCREENS` = **off** | on (the survey as built: shown once the path is locked; with `MOVES_PER_WISH` = 1 it asks only the rating, as quick mode did, and with 3 it asks all four)

### D-53 Any number of active wishes (new)
- **Now:** you can have any number of active wishes, each with at most one open move.
- **Setting:** `MAX_ACTIVE_WISHES` = **0 (unlimited)** | any number

---

## Module 3: Activity, Evidence & Growth (Christina Phan)

Your scoring formulas and constants are kept exactly. Base points, difficulty multipliers, tier thresholds, decay, the effort cap, the rubric, reviewer weights and the quality blend are written out unchanged in `docs/SCORING.md`. What changed is listed below.

### D-29 Moves come from the Wish Engine, not a catalog
- **Before:** 7 hand-written moves (all for data analysts), chosen on the Moves page.
- **Now:** evidence is always for a move the user selected in the Wish Engine (Module 2), and every move is model-generated. The static list is not used.
- **Setting:** none (core rule of Module 2)

### D-11 Scoring inputs come from the move
- **Before:** the user picked activity type, difficulty and skill on the evidence form, so anyone could claim "create, hard" for anything.
- **Now:** they are read from the selected move's tags (see Module 2, D-11). The rubric can still shift difficulty by one level, as in your design.
- **Setting:** `MOVE_TAGS_SOURCE` = **model** | user (your original: the evidence form shows skill, activity type and difficulty as choices, starting from the move's tags)

### D-08 Target career is chosen in the profile
- **Before:** a career dropdown on your Career page.
- **Now:** your same four careers and skill lists (moved into `data/catalog.json`). The user chooses the target career once, in their Module 1 profile.
- **Setting:** `SKILL_MODEL` = **taxonomy** | freeform

### D-13 Real reviewers instead of simulated ones
- **Before:** three fixed reviewer names picked by evidence id, whose rating was computed from the rubric score, so it only repeated it.
- **Now:**
  1. The rubric scores the evidence immediately; the user sees **pending** points.
  2. The buddy invited on that move (Module 4) rates it 1–5 and confirms it.
  3. That review finalises the points with your formula (`q = .4a + .6r`, or `.2a + .8r` when confidence < 0.5).
- **Setting:** `VALIDATION_MODE` = **ai_then_buddy** | ai_only (rubric alone is final) | buddy_required (no points until a buddy reviews)

### D-17 Pending points don't count yet (new)
- **Now:** points scored by the rubric but not yet confirmed show as pending. They don't count toward tiers or unlocks.
- **Setting:** `PROVISIONAL_COUNTS` = **false** | true

### D-18 No review within 7 days (new)
- **Now:** if no buddy reviews within 7 days, the evidence finalises on the rubric score alone and is marked "not peer-confirmed".
- **Setting:** `BUDDY_TIMEOUT_DAYS` = **7** | any number | 0 (wait forever)

### D-19 Buddy doesn't confirm (new)
- **Now:** if the buddy rates the evidence but doesn't confirm it, it goes to **needs work**. A revision goes back to the same buddy.
- **Setting:** none

### D-14 Reviewer weight comes from the buddy's own tier
- **Before:** the simulated reviewers had fixed tiers.
- **Now:** a buddy's weight is their own tier in the move owner's career, using your weights (Proficient 0.8, Demonstrated 1.0, Verified 1.2). It is never below Proficient, so new users can review.
- **Setting:** `BUDDY_TIER_SOURCE` = **role_tier** | fixed

### D-21 Effort once per move (bug fix)
- **Before:** every submission earned 3 effort points, including failed ones, so resubmitting farmed effort.
- **Now:** effort is earned once per selected move, and never for a submission whose scoring failed.
- **Setting:** `EFFORT_RULE` = **per_move_once** | per_submission

### D-25 Unlocks at a tier or above (bug fix)
- **Before:** an opportunity unlocked only when a skill was *exactly* at its tier, so reaching Demonstrated skipped the Proficient unlocks.
- **Now:** a skill **at or above** the tier unlocks it.
- **Setting:** `UNLOCK_MATCH` = **at_least** | exact

### D-23, D-24 Tier gates checked in order (bug fix)
- **Before:**
  - 500+ points were capped to Demonstrated without checking Demonstrated's gates (a hard item and a senior reviewer);
  - a downgrade from Demonstrated skipped Proficient's 2-item check.
- **Now:**
  - every gate is checked from the top down;
  - **Verified** needs an admin endorsement, which matches your "endorsement flag is admin-set" comment.
- **Settings:** `SCORING_RULES` = **v1.1** | v1.0 (your exact original rules) · `VERIFIED_REQUIRES` = **admin_endorsement** | points

### T-14 The dashboard no longer writes
- **Before:** `GET /dashboard` saved new unlocks on every view.
- **Now:** growth state is computed when read; unlocks are saved when evidence is finalised.
- **Setting:** none

### Security fix (no setting)
- **Before:** the rubric's criteria names, chosen by the model, were inserted into the page as HTML. Text a user put in their evidence could steer the model into injecting script.
- **Now:** criteria names are fixed to your four, and everything is shown as plain text.

---

## Module 4: Human Roles & Social Support (Michael Hawes)

Your invite rules are kept:
- invite → accept or decline;
- only the accepted buddy can see the work and leave feedback;
- one accepted buddy;
- no re-invite of the same person;
- no self-invite.

Your 14 tests are ported.

### D-32 Buddies join a move instead of a project
- **Before:** you created a project with milestones and invited a buddy onto it.
- **Now:** you invite a buddy onto a **move you selected** in the Wish Engine. The evidence you submit for it replaces milestones. Revisions go to the same buddy.
- **Setting:** none

### D-30 Two roles: reviewer and tester (new)
- **Before:** one generic "buddy".
- **Now:** two roles, matching the backbone diagram:
  - a **reviewer** rates and confirms, which counts toward points;
  - a **tester** tries what you made and comments, which is shown to you but doesn't count.

  One accepted buddy per role per move.
- **Settings:** `BUDDY_ROLES` = **reviewer,tester** · `TESTER_COUNTS` = **false** | true · `BUDDIES_PER_MOVE` = **1**

### D-13 Feedback has a rating and a confirm, and becomes evidence (new)
- **Before:** feedback was free text only.
- **Now:** a reviewer's feedback has a 1–5 rating, a confirm / don't-confirm choice and a comment. It is stored as **SocialEvidence v0.1** and sent to Module 3, where it finalises the owner's points.
- **Setting:** `VALIDATION_MODE` (see Module 3)

### D-35 Find buddies by exact handle or email
- **Before:** a "Find user by username" box. As you typed, it listed up to 20 usernames containing the text anywhere, each with an "Invite @user" button. In an app anyone can sign up to, that lets any user list everyone, one letter at a time.
- **Now:** you type the exact handle or email and press Send invite.
- **Setting:** `BUDDY_DISCOVERY` = **exact** | search (your original: matches anywhere in the handle, up to 20, shown as you type with an Invite button each; emails still match exactly)

### D-36 Buddies can open the evidence file (new)
- **Now:** your accepted buddy can open your evidence file through a link that works for 60 seconds. Files are never public.
- **Setting:** none

### D-37 Reviewing earns nothing (new, open)
- **Now:** reviewing someone else doesn't earn points. Should it? (Q3 below.)
- **Setting:** `REVIEWER_EARNS` = **none** | effort

### Re-invite after a decline
- **Before and now:** you can't re-invite the same person to the same move, even after they decline. Kept as you built it.
- **Setting:** `REINVITE_AFTER_DECLINE` = **false** | true

---

## Module 5: Opportunity & Event Return (JBarroqu)

Your design is now the design for the whole app (`docs/DESIGN.md`), and your Home layout is the app's home page. What changed is listed below.

### D-38 Notifications are real
- **Before:** 7 hardcoded notifications.
- **Now:** notifications are created by events in the other modules, using your six categories:

  | Event | Category |
  |---|---|
  | Move locked, next move ready | Pro |
  | Evidence scored, tier reached | Growth |
  | Points validated | Impact |
  | Buddy invite, accept or feedback | Social |
  | Opportunity unlocked | Enablement |
  | (reserved for external events) | Events |

  Your search, chips and read/unread toggle are kept.
- **Setting:** `NOTIFY_DISABLED` = list of notification kinds to switch off. The mapping lives in `backend/app/policies/notifications.py`.

### D-40 "Recommended" became "Best next move" (new)
- **Before:** two placeholder "Recommended" cards.
- **Now:** one card with the single most useful next action, taken in this order:
  1. a buddy review someone asked of you;
  2. evidence that needs work;
  3. evidence to submit;
  4. invite a buddy;
  5. next move ready;
  6. start a wish;
  7. complete your profile.
- **Setting:** the order list in `backend/app/modules/feed/next_move.py`

### D-39 While You Were Away (new)
- **Now:** a panel on Home lists notifications since your previous visit.
- **Setting:** `WYWA_MODE` = **since_last_visit** | days:7

### D-50 Chip mapping
- **Now:**
  - People → Social and Pro (as you had);
  - **Opportunity → Enablement and Events** (you had Events and Pro; Pro now means "your moves");
  - Impact, Growth, Enablement and Social → themselves.
- **Setting:** `OPPORTUNITY_CHIP` = **enablement_events** | events_pro (your original). The other chips are in `backend/app/modules/feed/rules.py`.

### D-41 External events not built yet
- **Now:** detecting outside events (career fairs, IEEE events, "happening nearby") isn't built. The Events category is reserved for it.
- **Setting:** `EVENT_SOURCES` = **none**

### Impact Score and metrics
- **Before:** the Impact Score was a fixed "50", and Metrics was a placeholder.
- **Now:** both show the real values from Module 3.
- **Setting:** none

---

## Open questions

The app runs with the default in the last column until an owner answers.

| # | Question | For | Default for now |
|---|---|---|---|
| Q1 | Demonstrated needs a reviewer who is already Demonstrated or above. Early on almost nobody is. Should admins be able to mark mentors, or should the gate be relaxed? | Christina Phan | admin-marked mentors count |
| Q2 | Should the "Peer reviewer" unlock (Proficient) control who can be a Reviewer buddy? | Christina Phan, Michael Hawes | no, anyone can review |
| Q3 | Should reviewing others earn points? | Michael Hawes, Christina Phan | no |
| Q4 | Before external events exist, hide the Events chip or show it empty? | JBarroqu | shown, empty state |

## Change log

| Date | Entry | Change | By |
|---|---|---|---|
| 2026-11-05 | all | Created; all entries waiting for owner review | Waleed |
| 2026-11-06 | D-35, D-50, D-46, D-11, D-45, D-01 | Each alternative now restores the original behaviour end to end, not just in the backend: buddy search as you type (`search` replaces `prefix`, which matched differently from the original), the original Opportunity chip, the full survey, user-chosen tags, the "Add to profile" offer and the Home reminder. Defaults unchanged. | Waleed |
