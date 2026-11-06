# Impact++ documentation

Impact++ joins five capstone modules into one product. A student describes where they are now and what they want to make happen. The product then:
1. suggests one small move at a time;
2. scores the evidence of doing it;
3. has a buddy confirm it;
4. brings the student back with what changed.

## Modules and owners

| # | Module | Owner | Branch | Module doc |
|---|---|---|---|---|
| 1 | Current Professional State | Cfoley5 | `Professional-State` | [modules/profile.md](modules/profile.md) |
| 2 | Wish & Next Move | Waleed | `wish-engine` | [modules/wish.md](modules/wish.md) |
| 3 | Activity, Evidence & Growth Feedback | Christina Phan | `Growth-Validation` | [modules/growth.md](modules/growth.md) |
| 4 | Human Roles & Social Support | Michael Hawes | `mike-branch` | [modules/social.md](modules/social.md) |
| 5 | Opportunity & Event Return | JBarroqu | `Event_Ecosystem` | [modules/feed.md](modules/feed.md) |

## Reading order
- **Module owners:** start with **your module doc**, then your section of **[DECISIONS.md](DECISIONS.md)**. Every choice made while integrating your work is listed there with the one setting that changes it. Mark each entry Agreed, or tell us what you'd like instead.
- **Everyone:** [PRODUCT.md](PRODUCT.md) explains the whole flow through one user's story, with a glossary.
- **Developers:**
  1. [ARCHITECTURE.md](ARCHITECTURE.md): how it fits together
  2. [CONTRACTS.md](CONTRACTS.md): the data each module hands the next
  3. [DATA_MODEL.md](DATA_MODEL.md): tables and ownership
  4. [API.md](API.md): endpoints
  5. [SCORING.md](SCORING.md): growth formulas with worked examples
  6. [DESIGN.md](DESIGN.md): the Event_Ecosystem design system and copy rules
  7. [SECURITY.md](SECURITY.md)
  8. [DEPLOY.md](DEPLOY.md): Supabase + Render
  9. [TESTING.md](TESTING.md)
  10. [PROVENANCE.md](PROVENANCE.md): where each piece came from, and a data note for branch owners
  11. [ROADMAP.md](ROADMAP.md): phases and status

The Wish Engine's earlier docs are kept in [wish-engine/](wish-engine/).
