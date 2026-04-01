# Pool Site Blueprint

A reusable reference for building friend-group sports pool apps (Masters Golf, Football Playoffs, March Madness, etc.) sharing a consistent design system, auth, and architecture.

---

## What This Blueprint Produces

A full-stack Next.js app where a friend group:
1. Signs in via magic link email
2. Makes picks across predefined categories before an event starts
3. Watches a live leaderboard update during the event
4. Chats with each other in real time via a dedicated chat page

All sites share the same Supabase project — users sign in once and are recognised across all pool apps.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ App Router, TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Database + Auth | Supabase (Postgres + Auth + Realtime) |
| Hosting | Vercel |
| Live data | Vercel Cron → ESPN unofficial API (or The Odds API) |
| Fonts | Geist Sans (via `next/font/local`) |

---

## 1. Project Initialisation

```bash
npx create-next-app@latest <site-name> --typescript --tailwind --app --src-dir
cd <site-name>
npm install @supabase/supabase-js @supabase/ssr
```

### Environment variables

Create `.env.local` (copy from `.env.local.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CRON_SECRET=generate_a_random_secret
```

Find keys in Supabase dashboard → **Project Settings → API**.

---

## 2. Supabase Setup

### Create project
1. Go to supabase.com → New project
2. To share auth across pool sites, **reuse the same Supabase project** for all of them — users have one account across all apps

### Enable magic link email
Magic link is on by default in Supabase — no configuration needed. Users enter their email, receive a one-click link, and land back in the app authenticated. No passwords, no OAuth app setup.

### Supabase client helpers

`src/lib/supabase/client.ts` — browser client:
```ts
import { createBrowserClient } from "@supabase/ssr";
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

`src/lib/supabase/server.ts` — server component client (handles cookie refresh):
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export const createClient = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
};
```

---

## 3. Database Schema Pattern

Every pool site uses the same four-table pattern. Replace sport-specific names as needed.

### `profiles` — extends auth.users
```sql
create table public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now() not null
);
-- RLS: public read, owner write
-- Trigger: auto-create on signup (copies full_name / email prefix from metadata)
```

### `contestants` / `golfers` — the pickable entities

The generic blueprint pattern uses a single `category` column. For Masters (multi-category membership), use **separate boolean flags** instead — golfers can appear in multiple pick categories simultaneously:

```sql
create table public.golfers (
  id            uuid default gen_random_uuid() primary key,
  name          text not null unique,
  country       text,
  region        text check (region in ('usa', 'european', 'asian', 'other')),
  -- Geographic region only — mutually exclusive
  -- Special-category membership uses boolean flags below:
  is_liv        boolean default false not null,      -- LIV Golf tour member
  is_longshot   boolean default false not null,      -- 100-1 odds or worse
  is_senior     boolean default false not null,      -- aged 50+ (Fossils category)
  odds          integer,        -- American odds (e.g. 5000 = +5000 = 50-1)
  world_ranking integer,
  updated_at    timestamptz default now() not null
);
-- RLS: public read, service_role write
```

> **Key pattern:** Geographic region (`usa`/`european`/`asian`/`other`) is mutually exclusive. Special categories (`is_liv`, `is_longshot`, `is_senior`) are independent boolean flags — a US-born LIV golfer gets `region = 'usa'` AND `is_liv = true`. He appears in both the USA picks list and the LIV picks list.

For simpler sports where one contestant belongs to one category only, a single `category text` column is sufficient.

### `contestant_stats` / `golfer_stats` — live event data
```sql
create table public.golfer_stats (
  id           uuid default gen_random_uuid() primary key,
  golfer_id    uuid references public.golfers on delete cascade not null,
  year         integer not null,
  score        integer,         -- total score relative to par (negative = under)
  round_score  integer,         -- current round score relative to par
  position     integer,         -- current leaderboard position
  round        integer,         -- current round number (1–4)
  thru         integer,         -- holes completed in current round (0–18)
  status       text default 'notstarted',  -- active / mc / wd / notstarted
  updated_at   timestamptz default now() not null,
  unique (golfer_id, year)
);
-- RLS: public read, service_role write
-- Enable Realtime on this table for live leaderboard updates
```

### `picks` — one row per user per year

One FK column per pick category. Use `onConflict: "user_id,year"` on upsert to handle updates without duplicate key errors:

```sql
create table public.picks (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users on delete cascade not null,
  year          integer not null,
  usa_pick      uuid references public.golfers,
  european_pick uuid references public.golfers,
  asian_pick    uuid references public.golfers,
  longshot_pick uuid references public.golfers,
  liv_pick      uuid references public.golfers,
  senior_pick   uuid references public.golfers,   -- "Fossils" category (aged 50+)
  submitted_at  timestamptz default now() not null,
  locked        boolean default false not null,
  unique (user_id, year)
);
-- RLS: public read, owner insert/update (update blocked when locked=true)
```

### `tournament_config` — global lock switch
```sql
create table public.tournament_config (
  year         integer primary key,
  picks_locked boolean default false not null,
  updated_at   timestamptz default now() not null
);
-- RLS: public read, service_role write
-- To lock picks: flip picks_locked=true in Supabase Table Editor
```

### `chat_messages` — real-time chat
```sql
create table public.chat_messages (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  display_name text not null,
  message      text not null check (char_length(message) between 1 and 280),
  created_at   timestamptz default now() not null
);
-- RLS: authenticated read/insert
-- Enable Realtime: alter publication supabase_realtime add table public.chat_messages;
```

---

## 4. Design System

The design language is **Augusta-inspired dark green/black glassmorphism** for Masters. Adapt the palette per sport:

| Pool | Primary | Accent | Vibe |
|---|---|---|---|
| Masters Golf | `#04120a` bg, `#16a34a` green | `#d97706` gold | Augusta National |
| Football Playoffs | `#060812` bg, `#2563eb` blue | `#dc2626` red | NFL primetime |
| March Madness | `#0a0618` bg, `#7c3aed` purple | `#f59e0b` amber | March bracket fever |

### CSS custom properties (in `globals.css`)
```css
:root {
  --background: #04120a;
  --foreground: #f0fdf4;
  --accent: #16a34a;
  --accent-hover: #15803d;
  --accent-light: #4ade80;
  --gold: #d97706;
  --gold-light: #fbbf24;
  --card: rgba(10, 28, 16, 0.6);
  --card-hover: rgba(15, 38, 22, 0.65);
  --field: rgba(20, 50, 30, 0.35);
  --muted: #6b8a72;
  --muted-light: #8aaa90;
  --border: rgba(34, 197, 94, 0.12);
  --border-strong: rgba(34, 197, 94, 0.22);
  --success: #4ade80;
  --error: #f87171;
}
```

### Reusable component classes (in `globals.css` `@layer components`)

- `.glass-card` — frosted glass card with backdrop-blur, border, border-radius 1rem
- `.glass-card-sm` — smaller radius variant (0.75rem)
- `.btn-primary` — filled accent pill button
- `.btn-gold` — filled gold pill button
- `.btn-outline` — transparent bordered pill button
- `.field-input` — dark form input with focus ring
- `.nav-link` — pill nav link with active state
- `.badge` — small uppercase label chip
- `.badge-usa` / `.badge-european` / `.badge-asian` / `.badge-longshot` / `.badge-liv` / `.badge-senior` — coloured category chips
- `.score-under` / `.score-over` / `.score-even` — green/red/white score text
- `.leaderboard-row` — grid row for leaderboard entries
- `.rank-1` / `.rank-2` / `.rank-3` — gold/silver/bronze rank badges

### Glow background
Three fixed radial gradient divs (center, bottom-left, bottom-right) give the page depth. Use a `GlowBackground` server component rendered in the root layout.

### Tailwind custom breakpoints (in `tailwind.config.ts`)
```ts
screens: {
  xs: "390px",    // iPhone 14/15 standard
  // sm: 640px   // default — large phones
  // md: 768px   // default — tablets, show desktop nav
  // lg: 1024px  // default
  // xl: 1280px  // default — MacBook Air 13"
  "3xl": "1440px", // MacBook Air 15"
  "4xl": "1920px", // Mac Pro / large displays
}
```

---

## 5. Layout Structure

```
RootLayout (server)
├── GlowBackground
├── TopNav (client) — brand + desktop nav links + gear icon (→ /settings)
│   Nav order: Picks · Leaderboard · Field · Chat · How It Works
├── <main> max-w-6xl 3xl:max-w-7xl 4xl:max-w-screen-2xl px-3 xs:px-4 3xl:px-8
│   └── {children}
├── BottomTabs (client) — md:hidden, fixed bottom, 6 tabs
│   Tab order: Picks · Board · Field · Chat · Rules · Settings
└── <footer> — "Brought to you by [Brand]"
```

### Main content width patterns
- **Mobile-first narrow pages** (picks, leaderboard, field, rules): `max-w-xl mx-auto`
- **Settings/single card pages**: `max-w-md mx-auto space-y-6`
- All pages: `pb-24 md:pb-8` to clear fixed bottom tabs on mobile

### Bottom tabs — 6 tabs
Mobile navigation (hidden on `md+`) with 6 fixed tabs:

| Tab | Icon | Route | Mobile Label |
|---|---|---|---|
| Picks | clipboard | `/picks` | Picks |
| Board | list | `/leaderboard` | Board |
| Field | flag | `/golfers` | Field |
| Chat | chat bubble | `/chat` | Chat |
| Rules | document | `/` | Rules |
| Settings | gear | `/settings` | Settings |

---

## 6. Auth Flow

### Routes
- `/auth/login` — magic link email form
- `/auth/callback` — exchanges code for session, redirects to `/picks`
- `/settings` — display name editor + sign out (gear icon in nav and bottom tabs)

### Login page pattern
```tsx
// Magic link only — no OAuth, no passwords, no setup required
async function handleMagicLink(e: React.FormEvent) {
  e.preventDefault();
  await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/picks` }
  });
  setSent(true); // Show "check your email" confirmation
}
```

User enters email → receives a link → clicks it → lands on `/auth/callback` → authenticated.

### Callback route — validate `next` param to prevent open redirect
```ts
const nextParam = searchParams.get("next") ?? "/picks";
const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/picks";
```

### Middleware — protect authenticated routes
```ts
if (!user && pathname.startsWith("/picks")) {
  // redirect to /auth/login?redirectedFrom=...
}
```

### Display name
- Optional — users set it via `/settings`
- Pre-fill from Google profile `full_name` metadata on signup trigger
- Used on leaderboard and in chat

---

## 7. Picks System

### Type definitions
Categories are defined as a typed array — drives both the form UI and the DB column names:
```ts
export const PICK_CATEGORIES = [
  { key: "usa_pick",      label: "American",  region: "usa",      description: "...", emoji: "🇺🇸" },
  { key: "european_pick", label: "European",  region: "european", description: "...", emoji: "🇪🇺" },
  { key: "asian_pick",    label: "Asian",     region: "asian",    description: "...", emoji: "🌏" },
  { key: "longshot_pick", label: "Longshot",  region: "longshot", description: "...", emoji: "🎯" },
  { key: "liv_pick",      label: "LIV Golfer",region: "liv",      description: "...", emoji: "⚡" },
  { key: "senior_pick",   label: "Fossils",   region: "senior",   description: "...", emoji: "🦕" },
];
```

### Picks page (server component)
Fetch in parallel: golfers, existing picks, golfer stats, tournament config. Pass `locked` state and `stats` down to the form:
```ts
const picksLocked = config?.picks_locked || existingPicks?.locked || false;
```

### PicksForm — dual-mode client component

The form has two modes controlled by `mode: "roster" | "editing"` state:

**Roster mode** (default when all picks exist):
- Shows each pick as a row: category emoji + label + golfer name + live stats
- Live stats via `RosterStat` component: shows odds pre-tournament, then live score/position/thru during tournament; MC shows "+10 penalty"
- Edit button (pencil icon) switches to editing mode — hidden when `locked=true`
- 🔒 Locked indicator shown when `picks_locked = true`

**Editing mode** (default when picks are incomplete):
- Radio button list per category, styled with selection highlight
- Each category card shows available golfers filtered by the appropriate flag:
  - Geographic categories: `golfer.region === cat.region`
  - Longshot: `golfer.is_longshot === true`
  - LIV: `golfer.is_liv === true`
  - Fossils/Senior: `golfer.is_senior === true`
- Extra badges shown (LIV, Longshot, 🦕) when a golfer qualifies for other categories
- Cancel button returns to roster mode if picks already exist
- Saves via direct Supabase upsert with `onConflict: "user_id,year"`:
  ```ts
  await supabase.from("picks").upsert(payload, { onConflict: "user_id,year" });
  ```

> **Important:** Always pass `{ onConflict: "user_id,year" }` as the second argument to `.upsert()` to avoid duplicate key constraint errors on updates.

### Region labels in UI
Show geographic region names, not countries (e.g. "USA" not "United States", "Europe" not "Northern Ireland"):
```ts
const REGION_LABEL = {
  usa: "USA", european: "Europe", asian: "Asia",
  longshot: "Longshot", liv: "LIV", senior: "Fossil", other: "Intl",
};
```

---

## 8. Leaderboard

Server component. Fetches picks with all golfer joins + stats in one query. No chat sidebar — chat lives at its own `/chat` route.

### Query pattern
Join each pick FK to its golfer and that golfer's current stats. Use typed tuples to associate pick column → golfer column → display category:

```ts
const GOLFER_KEYS: Array<[string, string, string]> = [
  ["usa_pick",      "usa_golfer",      "usa"],
  ["european_pick", "european_golfer", "european"],
  ["asian_pick",    "asian_golfer",    "asian"],
  ["longshot_pick", "longshot_golfer", "longshot"],
  ["liv_pick",      "liv_golfer",      "liv"],
  ["senior_pick",   "senior_golfer",   "senior"],
];
```

The third element (`categoryKey`) is used for emoji/label lookup — **not** `golfer.region`. This ensures a US-born senior picked as a Fossil shows 🦕, not 🇺🇸.

### Scoring pattern
```ts
const MC_PENALTY = 10;
const score = isMC ? MC_PENALTY : (stat?.score ?? null);
const totalScore = golferScores.reduce((sum, { score }) => sum + (score ?? 0), 0);
```

Sort ascending (lower = better). Rank ties share the same rank number.

### Pre-tournament display
When no stats exist yet (all scores null), show "0" in muted styling rather than "E" (even par) — the `allNoScore` flag detects this state. All participants with picks are shown from day one.

### Layout
`max-w-xl mx-auto` — narrow single column, no sidebar.

### Rank badges
Gold (#1), silver (#2), bronze (#3), neutral (rest).

---

## 9. Field / Golfer Browser

Server component + client component split for search/sort/filter interactivity without losing SSR data fetching.

### Server component (`golfers/page.tsx`)
Fetches all golfers and their current `golfer_stats`. Computes:
- `tournamentStarted`: `true` if any golfer has a non-`notstarted` status
- `currentRound`: the max `round` across all stats rows

Passes both to `<GolfersClient>`.

### Client component (`GolfersClient.tsx`)
Manages `search`, `category`, and `sort` state entirely client-side (no re-fetching):

**Category filter pills** — All, 🇺🇸 USA, 🇪🇺 EUR, 🌏 Asia, 🎯 Long, ⚡ LIV, 🦕 Fossils

**Sort options:**
- Position (default when tournament started)
- World Rank (default pre-tournament)
- Name
- Odds

**Filtering logic:**
- Geographic: `golfer.region === category`
- Longshot: `golfer.is_longshot`
- LIV: `golfer.is_liv`
- Fossils: `golfer.is_senior`

**Cut line** rendered only when `sort === "position"` and no active search/category filter.

**Tournament columns:** Pos · Player + badges · Total · Today · Thru

**Pre-tournament:** Name + region emoji · Region badge + flags · Odds (right-aligned)

Each golfer row shows all applicable badges (geographic + LIV + Longshot + 🦕) simultaneously.

---

## 10. Chat — Dedicated Route

Chat lives at `/chat` as a full-page route — not embedded in the leaderboard.

### Route (`/chat/page.tsx`)
Server component. Redirects unauthenticated users to login. Renders `<Chat user={user} fullPage />`.

### Chat component (`Chat.tsx`)
Accepts a `fullPage?: boolean` prop:
- `fullPage = true`: renders the chat panel directly in a `glass-card` at `height: calc(100vh - 13rem)` — no sidebar wrapper or mobile sheet
- `fullPage = false` (default): original sidebar + mobile floating-button behaviour (for backward compatibility)

### Supabase Realtime subscription
```ts
const channel = supabase
  .channel("chat_room")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "chat_messages" },
    (payload) => setMessages((prev) => [...prev, payload.new])
  )
  .subscribe();
```

### Username coloring — Twitch style
Hash the `user_id` to consistently pick one of 24 colors. Same user always gets the same color:
```ts
function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++)
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}
```

280 char limit, Enter to send, auto-scroll to latest.

---

## 11. How It Works / Rules Page (`/`)

The home route serves as a rules and how-to-play page, not a marketing landing. It is second-to-last in the nav (before Settings).

Sections (one column, `max-w-xl mx-auto`):
1. **Hero** — tournament name, tagline, CTA buttons (Make Your Picks / View Field)
2. **How to Play** — 4 numbered steps (Sign In → Set Your Name → Make Your Picks → Follow the Action)
3. **The Categories** — one card per pick category with emoji, badge, and rules description
4. **Scoring** — combined score to par, missed cut +10 penalty, lowest score wins
5. **Important Rules** — picks lock at tee time, one entry per person, live score updates
6. **Footer CTA** — gold button to submit picks

---

## 12. Settings Page (`/settings`)

Accessible via gear icon in top nav and via the Settings tab in bottom nav.

Two cards:
1. **Display Name** — text input, save button (disabled until changed), "✓ Saved" confirmation
2. **Account** — shows email, red sign out button

---

## 13. Live Data Sync

### Vercel Cron
`vercel.json`:
```json
{
  "crons": [{ "path": "/api/golf-stats", "schedule": "*/10 * * * *" }]
}
```
Runs every 10 minutes. Protected by `Authorization: Bearer <CRON_SECRET>` header.

### Sync route — `/api/golf-stats`
1. Validate `Authorization: Bearer <CRON_SECRET>` header
2. Fetch from ESPN unofficial API
3. Determine `currentRound` from the event data
4. For each competitor:
   - Compute `region` via `getGeographicRegion()` — returns `usa`/`european`/`asian`/`other` based on country (never `liv`)
   - Compute `isLiv` from `LIV_GOLFERS` set or `tour === 'liv'`
   - Extract `round_score` from `comp.linescores[currentRound - 1]?.value`
   - Upsert golfer (name, country, region, is_liv, world_ranking)
   - Upsert golfer_stats (score, round_score, position, thru, round, status)
   - Auto-set `is_longshot = true` for any golfer with `odds >= 10000`

### Finding the ESPN event ID each year
```
https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga
```
Look for the event `id` in the JSON. Update the `MASTERS_EVENT_ID` constant at the top of the sync route annually.

### LIV golfer list
Maintain a `LIV_GOLFERS` set in the sync route. Update each year before the tournament:
```ts
const LIV_GOLFERS = new Set(["Brooks Koepka", "Bryson DeChambeau", /* etc. */]);
```

### Odds data (pre-tournament)
The Odds API (`the-odds-api.com`) — free tier 500 requests/month. Use ~1 week before event to update golfer odds. American odds format (e.g. `+5000` = 50-1, stored as integer `5000`).

---

## 14. Security Checklist

- [ ] All DB writes go through server-side API routes or RLS-protected Supabase SDK calls
- [ ] No raw SQL string interpolation — use parameterized Supabase SDK only
- [ ] All user content rendered as JSX text (auto-escaped) — no `dangerouslySetInnerHTML`
- [ ] Auth callback `next` param validated to be a relative path (open redirect prevention)
- [ ] Cron route protected by `CRON_SECRET` bearer token
- [ ] Service role key only used server-side, never in client bundle
- [ ] RLS enabled on every table

---

## 15. Pre-Event Checklist

Run ~1 week before the event starts:

- [ ] Confirm Masters field is finalised (Augusta National announces ~2 weeks before)
- [ ] Update `MASTERS_EVENT_ID` in `api/golf-stats/route.ts`
- [ ] Update `LIV_GOLFERS` set with this year's LIV members playing Augusta
- [ ] Pull real odds from The Odds API and update `odds` column in `golfers` table
- [ ] Add any new golfers not already in DB — set `region`, `is_liv`, `is_longshot`, `is_senior`
- [ ] Run the `is_senior` SQL update to mark/unmark Fossils for this year's field
- [ ] Remove or deactivate golfers who did not receive invitations
- [ ] Add `tournament_config` row: `INSERT INTO tournament_config (year, picks_locked) VALUES (2026, false)`
- [ ] Confirm Vercel Cron is active and `CRON_SECRET` env var is set in Vercel dashboard
- [ ] Test the cron endpoint manually: `GET /api/golf-stats` with `Authorization: Bearer <CRON_SECRET>`
- [ ] Communicate picks deadline to participants

### To lock picks (when event starts)
In Supabase dashboard → Table Editor → `tournament_config` → set `picks_locked = true` for the current year. No redeployment needed.

### To mass-lock individual rows (belt-and-suspenders)
```sql
update public.picks set locked = true where year = extract(year from now())::integer;
```

---

## 16. Vercel Deployment

1. Push to GitHub
2. Import repo in Vercel
3. Add all four env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`)
4. Set Supabase Auth redirect URL to `https://your-domain.com/auth/callback`
5. Deploy — cron jobs activate automatically from `vercel.json`

---

## 17. File Structure Reference

```
src/
├── app/
│   ├── api/
│   │   └── golf-stats/route.ts     # Cron job — syncs live ESPN data every 10 min
│   ├── auth/
│   │   ├── callback/route.ts       # Magic link callback
│   │   └── login/page.tsx          # Email magic link sign-in
│   ├── chat/page.tsx               # "Talk Yo Shit 💬" — full-page chat route
│   ├── golfers/page.tsx            # Field browser — server component (data fetch)
│   ├── leaderboard/page.tsx        # Pool leaderboard — vertical list, no chat sidebar
│   ├── picks/page.tsx              # Pick submission + roster view
│   ├── set-name/page.tsx           # First-run name setting (post login)
│   ├── settings/page.tsx           # Display name + sign out
│   ├── globals.css                 # Design tokens + component classes
│   ├── layout.tsx                  # Root layout with nav/footer/bottom tabs
│   └── page.tsx                    # How It Works / Rules page (home route)
├── components/
│   ├── BottomTabs.tsx              # Mobile bottom nav — 6 tabs (md:hidden)
│   ├── Chat.tsx                    # Real-time chat — fullPage prop for /chat route
│   ├── GlowBackground.tsx          # Fixed decorative gradient divs
│   ├── GolfersClient.tsx           # Field browser — client component (search/sort/filter)
│   ├── PicksForm.tsx               # Picks form — roster/editing dual-mode (client)
│   └── TopNav.tsx                  # Sticky top nav with desktop links
├── lib/
│   └── supabase/
│       ├── client.ts               # Browser client
│       └── server.ts               # Server client (cookie handling)
├── middleware.ts                   # Auth protection + session refresh
└── types/
    └── index.ts                    # Shared types + PICK_CATEGORIES + TOURNAMENT_YEAR

supabase/
└── schema.sql                      # Full schema + seed data (run once in SQL editor)

docs/
├── data-sources.md                 # How to update live data each year
└── pool-site-blueprint.md          # This file

vercel.json                         # Cron schedule config
.env.local.example                  # Env var template
```

---

## 18. Adapting for Each Sport

### Football Playoffs
- Categories: AFC team, NFC team, Super Bowl pick, top scorer, etc.
- Scoring: wins, point differentials, or a simple bracket-style elimination
- ESPN endpoint: `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- Lock date: Wild Card weekend kickoff
- Theme: dark navy/blue with red accent

### March Madness
- Categories: bracket regions (East, West, South, Midwest) — pick a team per region + overall winner
- Scoring: points per correct pick, multiplied by round
- ESPN endpoint: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`
- Lock date: tip-off of first game Thursday
- Theme: dark indigo/purple with amber accent

### Common adaptation steps
1. Update `--accent`, `--gold`, and background in `globals.css`
2. Redefine `PICK_CATEGORIES` in `types/index.ts`
3. Update DB schema: rename/add columns in `picks` table per categories
4. Decide: single `category` column (simple) vs boolean flags (multi-category membership)
5. Update `schema.sql` seed data with the new field/bracket
6. Update `golf-stats` route with new ESPN endpoint + scoring logic
7. Update `EVENT_ID` constant
8. Update site title and metadata in `layout.tsx`
9. Update bottom tab labels and icons in `BottomTabs.tsx`
