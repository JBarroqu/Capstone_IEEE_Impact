# Module 5: Opportunity & Event Return (Feed and Home)

**Owner:** JBarroqu.
**Source:** branch `Event_Ecosystem` @ `6fd258c` (`Notifications/`).
**Code:** `backend/app/modules/feed/`, `frontend/src/modules/feed/`, `frontend/src/app/AppShell.tsx`, `frontend/src/design/`.

## What the branch had
A Figma Make export (React 19, Vite 8, Tailwind 4) of one page:
- a sticky glass header with the IEEE logo, nav links, search, a bell and a profile menu;
- a left column with an avatar, an Impact Score ("50"), and metrics and recommended placeholders;
- a right column with a notification list: 7 hardcoded items in six categories (Social, Pro, Enablement, Impact, Events, Growth), filter chips, search and a read/unread toggle.

There was no backend.

As committed, it doesn't build:
- `vite.config.ts` imports a missing `.figma/make/site.json`;
- `App.tsx` line 23 has a syntax error.

## What we kept
- **The visual design, for the whole app** (`DESIGN.md`): the colours, the Poppins and Roboto type, the glass header, the panels, the category icon circles, the chips and the notification row.
- The Home layout: profile and score on the left, notifications on the right.
- The six categories and the chip filters (D-38, D-50).
- Search and the read/unread toggle.

## What we changed, and why

| Change | Why | Decision |
|---|---|---|
| Notifications are real, created from other modules' events | The mockup had hardcoded items | D-38 |
| Impact Score is the real one from Module 3 | It was hardcoded to 50 | CONTRACTS |
| "Recommended" becomes **Best next move**: one clear action | The backbone diagram's "BestNextMoveTrigger" | D-40 |
| **While You Were Away**: everything since your previous visit | The diagram's return feature | D-39 |
| `time` strings ("2 Day Ago") replaced by real timestamps | Formatting happens in the app | CONTRACTS |
| Fonts self-hosted (`@fontsource/poppins`, `@fontsource/roboto`) | The Figma-only font URLs don't work outside Figma | DESIGN |
| Icons exported by name from the branch's SVGs | Hashed file names (`6f490.svg`) are unreadable | DESIGN |
| Figma plugins, `site.json` slots and the JSX `any` override dropped | Editor plumbing, not app code | PROVENANCE |
| Bugs fixed: the two menus shared one state; the count pill showed the filtered count, not unread; the bell dot ignored filters | | |

## Not built yet
- Detecting external events: career fairs, IEEE events, "an event is happening nearby" (D-41).
- The Events category is reserved for it.
- The schema has a placeholder (`EventContext.external`).

## How other modules use it (`feed/api.py`)
- Other modules don't call the feed directly. They publish domain events, and `feed/subscribers.py` turns each into at most one notification (deduplicated).
- `get_event_context(user_id) -> EventContext`
- `best_next_move(user_id) -> BestNextMoveTrigger`

## Policies that affect this module
- `NOTIFY_DISABLED` and the mapping in `policies/notifications.py` (D-38)
- `WYWA_MODE` (D-39)
- the best-next-move order (D-40)
- `EVENT_SOURCES` (D-41)
- the chip mapping (D-50)

## Tests
- Each domain event creates exactly one notification, or none when disabled.
- Replaying an event creates no duplicate.
- The priority-order table for best next move.
- Home component tests.
- End-to-end: the feed updates through the whole loop.
