# Design

There is one visual design: **Event_Ecosystem's** (branch `Event_Ecosystem` @ `6fd258c`, `Notifications/src/App.tsx` and `index.css`). The styles of the other modules are discarded:
- the Wish Engine's Figtree, ink and blue band;
- Growth-Validation's sidebar;
- mike-branch's navy header.

The values below are copied from that branch. They are defined once as Tailwind v4 `@theme` tokens in `frontend/src/design/tokens.css`. Components use the tokens; arbitrary hex values in components are not allowed.

## Type

The fonts are self-hosted with `@fontsource/poppins` (400, 500, 600, 700) and `@fontsource/roboto` (500). The branch loaded them from Figma-internal URLs, which only work inside Figma.

| Use | Font | Size / tracking | Colour |
|---|---|---|---|
| Body | Poppins 400 | 16px | `--color-text` #3c3c3c |
| Big number (Impact Score) | Poppins 700 | 32px, -0.96px, lh 1.5 | `--color-primary` #00629b |
| Panel heading | Poppins 700 | 16px, -0.48px | `--color-heading` #287aaa |
| Row title | Poppins 600 | 16px, lh 24px | black |
| Row description | Poppins 400 | 16px | `--color-secondary` #5b6472 |
| Timestamp | Poppins 600 | 16px | `--color-time` #729acd |
| Nav link | Poppins 600 (active) / 500 | 14px, -0.42px | #0b3142 active, #00629b other |
| Search input | Poppins 400 | 15px, -0.45px | |
| Chip | Roboto 500 | 14px, lh 20px, 0.1px | #49454f; active: #00629b |
| Caption, count pill | Poppins | 12px, -0.36px | #3c3c3c |

Page titles, which the mockup had none of, use Poppins 700 at 24px in `--color-navy`.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--color-primary` | #00629b | IEEE blue: primary buttons, links, active chip, focus ring, score |
| `--color-heading` | #287aaa | panel headings |
| `--color-navy` | #0b3142 | page text, avatar circle, page titles |
| `--color-text` | #3c3c3c | body |
| `--color-secondary` | #5b6472 | secondary text |
| `--color-time` | #729acd | timestamps |
| `--color-border` | #9db0c9 | panel borders, placeholders |
| `--color-chip-text` / `--color-chip-border` | #49454f / #cac4d0 | inactive chips |
| `--color-search` | #edf5ff | search field, menu hover |
| `--color-panel` | #f8fbfe | panels |
| `--color-subpanel` | #f5f7f9 | panels inside panels |
| `--color-chip-active` | #e7f3fe | active chip background |
| `--color-unread` | #f04444 | unread dot |
| `--color-skeleton` | #d9d9d9 | loading skeletons |
| page background | `linear-gradient(180deg, #fff 0%, #e7f3fe 86%, #dfeffe 100%)`, body #dfeffe | |
| header | `bg-white/70`, `border-white/60`, `backdrop-blur-lg` | |

Status colours for the modules are taken from the category palette below, so no new hues are introduced:
- needs work uses Impact orange;
- validated uses Growth teal;
- errors use the unread red.

### Categories
Each category is shown as a 50px tinted circle with a 25px icon. Six categories are used for notifications, the score and tiers.

| Category | Circle | Icon colour | Icon | Used for |
|---|---|---|---|---|
| Social | #FEE8E8 | #FD3D40 | users | buddy invites and feedback |
| Pro | #E4DAFB | #5D2EFB | user-tie | moves locked, next move ready |
| Enablement | #E8F5FE | #0578FB | hand | unlocks |
| Impact | #FEF5EC | #FE7F05 | double-chevron-up | validated points; needs-work accents |
| Events | #FDF0F9 | #FD3D93 | lightbulb | external events (reserved) |
| Growth | #E9F6F7 | #059F9B | sprout | evidence scored, tier reached |

## Shape and space
- **Radius:** 8px (chips, cards, sub-panels, menu items), 12px (panels, menus), 20px (search field), full (avatar, pills, dots).
- **Borders:** panels have a 1px `--color-border` border. Notification rows have a bottom border.
- **Shadows:** panels are flat. Cards use `hover:shadow-md`; menus use `shadow-lg`.
- **Spacing:** a 4/8px scale (Tailwind 1, 2, 3, 4, 5, 6, 8, 12). The mockup's odd Figma values (17px, 23px, 29px, 47px) are rounded to the nearest step.

## Layout
- **Header:** sticky glass header, `max-w-[1280px]`, about 104px tall.
  - Left: IEEE logo.
  - Nav: **Home, Profile, Moves, Growth, Buddies**, each a real route. These replace the mockup's dead links.
  - Right: search, the bell (unread dot), and the profile menu (Profile, Sign out).
- **Home:** `max-w-[1210px]` grid, `lg:grid-cols-[424px_minmax(0,738px)]`, gap 32px.
  - Left column: profile card with Impact Score, Best next move, While You Were Away.
  - Right column: Notifications panel (heading, unread count pill, chips, scrollable list up to 474px tall), then Active moves.
- **Other pages:** same container. One main panel; a left panel where the page has a summary, e.g. Growth's score and tiers.
- **Responsive:**
  - nav collapses to the hamburger below `md`;
  - timestamps hide below `sm`;
  - the two columns stack below `lg`;
  - minimum width 320px.

## Components (`frontend/src/components/ui/`)

| Component | Based on |
|---|---|
| AppShell, NavLink, UserMenu | header |
| Panel, SubPanel, Card | panels and skeleton cards |
| Chip, ChipRow (scrollable, hidden scrollbar) | TopicChips |
| CategoryIcon | category circles |
| FeedRow | notification row |
| CountPill, UnreadDot | |
| Button (primary #00629b filled, secondary outlined, text) | new; matches the blue and the radius |
| Field, TextArea, TagInput, Select | new; uses the search-field fill |
| Stepper | new; onboarding |
| Dropzone | new; resume and evidence upload |
| TierBadge, ProgressToNext | new; growth |
| MoveCard | the Wish Engine's option card, restyled |
| EmptyState, Skeleton, Toast | |
| Icon | the branch's SVGs, renamed (`users.svg`, `user-tie.svg`, `bell.svg`, ...) |

## Motion and focus
- `transition-colors` on chips and rows.
- `hover:scale-105` on round icon buttons.
- `transition-shadow` on cards.
- Smooth scroll.
- Focus ring: `focus-visible:outline-2 outline-[--color-primary]`.
- No dark mode.

## Copy
- Written for senior ASU CS students: direct and specific.
- **No emoji.**
- **Never say "AI" or "smart" in the interface.** Say "moves", "options", "review", "score", "feedback".
- A frontend test checks string literals for banned words.
