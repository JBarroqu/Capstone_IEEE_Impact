# Product

Impact++ helps a CS student turn "I want to ..." into small, real steps.

- Each step produces evidence of skill growth.
- That evidence is confirmed by another person.
- The result unlocks opportunities.

The product is one pipeline of five modules, each built by a different team member and joined here.

| Stage | Module | Owner | Output |
|---|---|---|---|
| 1 | Current Professional State: background, skills, interests, experiences, strengths, directions for improvement | Cfoley5 | ProfessionalState v0.1 |
| 2 | Wish & Next Move: input a wish, get 3 move options, choose / reject / reroll | Waleed | SelectedMove v0.1 |
| 3 | Activity, Evidence & Growth Feedback: submit evidence, score effort + evidence, visible growth state | Christina Phan | GrowthState + Unlocks v0.1 |
| 4 | Human Roles & Social Support: invite a reviewer or tester, feedback, confirmation becomes evidence | Michael Hawes | SocialEvidence v0.1 |
| 5 | Opportunity & Event Return: notifications, While You Were Away, best next move | JBarroqu | EventContext + BestNextMoveTrigger v0.1 |

The audience is senior ASU computer science students.

**Copy rules:**
- No emoji.
- Never say "AI" or "smart" in the interface. Say "moves", "options", "review", "score".

## One user, end to end

1. **Sign up.** Sam signs up with Google. The app sends Sam to onboarding (D-01).
2. **Onboarding (Module 1).**
   - Sam uploads a resume. A minute later the form is filled in: major Computer Science, skills Python, SQL and pandas, a capstone dashboard as a contribution.
   - Sam fixes two fields, adds "explaining results clearly" as a strength and "statistics" as a growth area, picks target career **Data analyst**, and chooses the handle `sam_r`. Sam saves.
   - The resume file is deleted (D-42).
3. **Home (Module 5).**
   - The left column shows Sam's profile card and an Impact Score of 0.
   - The best next move card says "Start a wish". The feed is empty.
4. **Wish (Module 2).**
   - Sam types "Get a data analyst internship for next summer", says why, and notes that tutorials didn't stick.
   - Sam answers three follow-up questions written for this wish.
   - The app shows three options, each sized for this week and fitted to Sam's profile (D-06). Each is tagged with a skill from the data analyst list (D-11).
   - Sam rejects the first set as "Too big" and gets a smaller set.
   - Sam picks "Publish one SQL analysis of a public dataset". The feed shows "Move locked" (Pro).
5. **Evidence (Module 3).**
   - Sam does it and submits the GitHub link with a two-line summary.
   - Within seconds the rubric scores it: relevance 0.9, completeness 0.7, quality 0.8, clarity 0.85, which averages 0.81. The move was tagged create / moderate, so Sam sees **24.38 pending points** in SQL (20 × 1.5 × 0.8125) and specific feedback.
   - The feed shows "Evidence scored" (Growth).
6. **Buddy (Module 4).**
   - Sam invites classmate `priya_k` as a **reviewer** on the move. Priya gets a Social notification and accepts.
   - Priya opens the evidence, rates it 4 of 5, confirms it, and comments "Ran the queries, works".
   - That becomes social evidence, and Sam's points are finalised with the rubric + reviewer formula (D-13, D-15).
   - The feed shows "Points validated" (Impact), and with enough points "Familiar in SQL" (Growth) and "Study group unlocked" (Enablement).
7. **Next move.**
   - Move 2 opened as soon as Sam submitted evidence (D-03); he never had to wait for Priya. Her review decides the points, not the path.
   - Sam's second set of options knows how the first went so far (D-07): the score, the rubric's note, and Priya's comment once she has reviewed.
8. **Return (Module 5).** A few days later Sam comes back. "While You Were Away" lists what happened since the last visit (D-39).

If Priya had never reviewed, the evidence would finalise on the rubric alone after 7 days, marked "not peer-confirmed" (D-18).

## Glossary

| Term | Meaning |
|---|---|
| Professional state | Your profile: background, skills, interests, contributions, strengths, growth areas, target career |
| Wish | Something you want to make happen, in your own words |
| Option | One of the 3 suggested moves shown for a step |
| Move | A small, concrete action sized for this week. Every move is generated (D-29). |
| Selected move | The option you picked. It's what Module 2 hands to Modules 3 and 4. |
| Activity type | What kind of move it is: explore, create, test, share, connect, enable. Sets base points. |
| Difficulty | easy / moderate / hard. Multiplies points. |
| Skill | One skill from your target career's list in `data/catalog.json` (D-08) |
| Evidence | What you submit to show you did a move: a link, a file or text, plus a summary |
| Rubric score | The model's 0–1 scores for relevance, completeness, quality and clarity, and their average |
| Pending points | Points from the rubric score that aren't final yet (D-17) |
| Validated points | Final points, after buddy confirmation or the timeout |
| Effort points | Small points for doing moves, capped (D-20, D-21) |
| Impact Score | Validated points + counted effort points |
| Buddy | Someone you invite onto a move: a **reviewer** (rates and confirms) or a **tester** (tries it, comments) |
| Social evidence | The record of a buddy's review, passed from Module 4 to Module 3 |
| Tier | Familiar, Proficient, Demonstrated, Verified: per skill, by points plus gates (D-23) |
| Role tier | Your overall tier: the highest tier that 60% of your core skills reached (D-28) |
| Opportunity / unlock | Something a tier gives access to, e.g. study group, mentor match (D-25) |
| Feed item | A notification in one of the six categories: Social, Pro, Enablement, Impact, Events, Growth |
| Best next move | The single most useful thing to do now, shown on Home (D-40) |
| Policy | A named setting that switches a decision (`backend/app/policies/defaults.py`; owner-facing ones in `MODULE_OWNER_DECISIONS.md`) |

## Out of scope for this integration

- Detecting external events (career fairs, IEEE events) for the Events category (D-41).
- Badges beyond Growth-Validation's four computed badges.
- Accounts with roles beyond user and the separate admin.
- Mobile apps. The web app works on phones.
- Data export or deletion for a participant beyond account deletion (deleting the account deletes the user's data).
