# Pool Site Blueprint

A reusable reference for building friend-group sports pool apps (Masters Golf, Football Playoffs, March Madness, etc.) sharing a consistent design system, auth, and architecture.

---

## What This Blueprint Produces

A full-stack Next.js app where a friend group:
1. Signs up with email + password and a display name
2. Makes picks across predefined categories before an event starts
3. Watches a live leaderboard update during the event via Supabase Realtime
4. Sees a filterable field/player browser with live scores

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Database + Auth | Supabase (Postgres + Auth + Realtime) |
| Hosting | Vercel |
| Live data | Vercel Cron → ESPN unofficial API |
| Fonts | Geist Sans (via `next/font/local`) |

---

## 1. Project Initialisation

```bash
npx create-next-app@latest <site-name> --typescript --tailwind --app --src-dir
cd <site-name>
npm install @supabase/supabase-js @supabase/ssr country-flag-icons
```

### Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CRON_SECRET=generate_a_random_secret
```

---

## 2. Supabase Setup

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
export const createClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
};
```

---

## 3. Database Schema Pattern

### `profiles` — extends auth.users
```sql
create table public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text unique,
  avatar_url   text,
  created_at   timestamptz default now() not null
);
-- RLS: public read, owner write
```

### `golfers` — the pickable entities

Use separate boolean flags for special-category membership — golfers can appear in multiple pick categories simultaneously:

```sql
create table public.golfers (
  id            uuid default gen_random_uuid() primary key,
  name          text not null unique,
  country       text,
  region        text check (region in ('usa', 'european', 'international')),
  -- Geographic region: mutually exclusive
  -- Special-category membership uses boolean flags:
  is_liv        boolean default false not null,        -- LIV Golf tour member
  is_longshot   boolean default false not null,        -- +10000 odds or worse
  is_past_champ boolean default false not null,        -- former Masters champion
  is_young_gun  boolean default false not null,        -- under 30 years old
  odds          integer,        -- American odds (e.g. 10000 = +10000 = 100-1)
  world_ranking integer,
  image_url     text,
  updated_at    timestamptz default now() not null
);
-- RLS: public read, service_role write
```

> **Key pattern:** Geographic region is mutually exclusive. Special categories are independent boolean flags. A US-born LIV golfer gets `region = 'usa'` AND `is_liv = true` — appears in both the USA list and the LIV list.

### `golfer_stats` — live event data
```sql
create table public.golfer_stats (
  id           uuid default gen_random_uuid() primary key,
  golfer_id    uuid references public.golfers on delete cascade not null,
  year         integer not null,
  score        integer,
  round_score  integer,
  position     integer,
  round        integer,
  thru         integer,
  tee_time     timestamptz,
  status       text default 'notstarted'
    check (status in ('active', 'mc', 'wd', 'notstarted', 'complete')),
  updated_at   timestamptz default now() not null,
  unique (golfer_id, year)
);
-- RLS: public read, service_role write
-- Enable Realtime: alter publication supabase_realtime add table public.golfer_stats;
-- Required for Realtime: alter table public.golfer_stats replica identity full;
```

### `picks` — one row per user per year
```sql
create table public.picks (
  id                uuid default gen_random_uuid() primary key,
  user_id           uuid references auth.users on delete cascade not null,
  year              integer not null,
  usa_pick          uuid references public.golfers,
  european_pick     uuid references public.golfers,
  international_pick uuid references public.golfers,
  longshot_pick     uuid references public.golfers,
  liv_pick          uuid references public.golfers,
  past_champ_pick   uuid references public.golfers,
  young_guns_pick   uuid references public.golfers,
  submitted_at      timestamptz default now() not null,
  locked            boolean default false not null,
  unique (user_id, year)
);
-- RLS: public read, owner insert/update
```

### `tournament_config` — global lock switch
```sql
create table public.tournament_config (
  year         integer primary key,
  picks_locked boolean default false not null,
  updated_at   timestamptz default now() not null
);
-- RLS: public read, service_role write
```

---

## 4. Design System

Augusta-inspired dark green/black glassmorphism. Adapt the palette per sport:

| Pool | Primary | Accent | Vibe |
|---|---|---|---|
| Masters Golf | `#04120a` bg, `#16a34a` green | `#d97706` gold | Augusta National |
| Football Playoffs | `#060812` bg, `#2563eb` blue | `#dc2626` red | NFL primetime |
| March Madness | `#0a0618` bg, `#7c3aed` purple | `#f59e0b` amber | Bracket fever |

### CSS custom properties
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
  --muted: #6b8a72;
  --muted-light: #8aaa90;
  --border: rgba(34, 197, 94, 0.12);
  --success: #4ade80;
  --error: #f87171;
}
```

### Reusable component classes
- `.glass-card` / `.glass-card-sm` — frosted glass card with backdrop-blur
- `.btn-primary` / `.btn-gold` / `.btn-outline` — pill buttons
- `.field-input` — dark form input with focus ring
- `.badge` + `.badge-usa` / `.badge-european` / `.badge-international` / `.badge-liv` / `.badge-longshot` / `.badge-past-champ` / `.badge-young-gun`
- `.score-under` / `.score-over` / `.score-even` — green/red/white score text
- `.rank-badge` / `.rank-1` / `.rank-2` / `.rank-3` — gold/silver/bronze rank badges

---

## 5. Layout Structure

```
RootLayout (server)
├── GlowBackground       — fixed decorative gradient divs
├── TopNav (client)      — brand + desktop nav links + gear icon (→ /settings)
│   Nav order: Picks · Board · Field · How It Works
├── <main>
│   └── {children}
└── BottomTabs (client)  — md:hidden, 4 tabs
    Tab order: Picks · Board · Field · Account
```

### Bottom tabs — 4 tabs

| Tab | Route | Label |
|---|---|---|
| Clipboard | `/picks` | Picks |
| Bar chart | `/leaderboard` | Board |
| Calendar | `/field` | Field |
| Person | `/settings` | Account |

---

## 6. Auth Flow

### Email + password
```tsx
// Sign up — save display name to profiles on success
const { data, error } = await supabase.auth.signUp({ email, password });
if (data.user) {
  await supabase.from("profiles").upsert({
    id: data.user.id,
    display_name: displayName.trim() || email.trim(), // fallback to email
  });
}

// Sign in
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Always use window.location.href for redirects after auth — not router.push
// router.push is a soft navigation and doesn't pick up the new session cookie
window.location.href = redirectedFrom;
```

### Sign out
```ts
await supabase.auth.signOut();
window.location.href = "/"; // hard redirect — clears session from browser
```

### Middleware — efficient auth protection
Only call `supabase.auth.getUser()` for routes that actually need it. Public pages get zero auth overhead:

```ts
const PROTECTED = ["/picks", "/leaderboard", "/settings"];

export async function middleware(request: NextRequest) {
  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!isProtected) return NextResponse.next({ request }); // skip auth entirely

  // ... auth check + redirect
}
```

---

## 7. Performance Pattern — Suspense Streaming

Every page uses this pattern so the shell renders immediately while data loads:

```tsx
// Page component is synchronous — renders shell + skeleton instantly
export default function SomePage() {
  return (
    <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight">Title</h1>
      <Suspense fallback={<PageSkeleton />}>
        <PageContent />   {/* async server component */}
      </Suspense>
    </div>
  );
}

// All data fetching inside the async component
async function PageContent() {
  const data = await fetchData();
  return <ClientComponent data={data} />;
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="glass-card h-14 animate-pulse" />
      ))}
    </div>
  );
}
```

### ISR with service role client
Pages that don't need user context (field, leaderboard) use the service role client so `export const revalidate` works. Cookie-based clients make pages dynamic, defeating ISR:

```ts
// ✅ ISR works — no cookies
const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
export const revalidate = 30;

// ❌ Dynamic — createClient() reads cookies
const supabase = await createServerClient(); // cookies() call = dynamic
```

---

## 8. Picks System

### Type definitions
```ts
export const PICK_CATEGORIES = [
  { key: "usa_pick",           label: "American",      region: "usa",          emoji: "🇺🇸" },
  { key: "european_pick",      label: "European",      region: "european",     emoji: "🇪🇺" },
  { key: "international_pick", label: "International", region: "international",emoji: "🌍" },
  { key: "longshot_pick",      label: "Longshot",      region: "longshot",     emoji: "🎯" },
  { key: "liv_pick",           label: "LIV Golfer",    region: "liv",          emoji: "⚡" },
  { key: "past_champ_pick",    label: "Past Champ",    region: "past_champ",   emoji: "🏆" },
  { key: "young_guns_pick",    label: "Young Guns",    region: "young_gun",    emoji: "🌟" },
];
```

### PicksForm — accordion client component

The form has two modes controlled by `mode: "roster" | "editing"` state:

**Roster mode** (when all picks are saved):
- Shows each pick as a row with live stats
- Edit button switches to editing mode — hidden when `locked = true`

**Editing mode** (when picks are incomplete or editing):
- Accordion of categories — all open by default
- Click a golfer to select; click again to deselect
- Golfers filtered by category flag:
  - `usa`: `golfer.region === 'usa'`
  - `european`: `golfer.region === 'european'`
  - `international`: `golfer.region === 'international'`
  - `longshot`: `golfer.is_longshot === true`
  - `liv`: `golfer.is_liv === true`
  - `past_champ`: `golfer.is_past_champ === true`
  - `young_gun`: `golfer.is_young_gun === true`
- Save via Supabase upsert with `onConflict: "user_id,year"`

### Locks
```ts
const picksLocked = config?.picks_locked || existingPicks?.locked || false;
// Save button hidden (not just disabled) when locked
// Edit button hidden when locked
```

---

## 9. Leaderboard

Server component with ISR (`revalidate = 30`). Uses service role client so caching works.

### Query pattern
Join each pick FK to its golfer in a single query using Supabase foreign key aliases:
```ts
supabase.from("picks").select(`
  *,
  usa_golfer:golfers!picks_usa_pick_fkey(id, name),
  european_golfer:golfers!picks_european_pick_fkey(id, name),
  ...
`)
```

### Scoring
```ts
const score = stat?.score ?? null; // MC golfers count their actual score at time of cut
const totalScore = golferScores.reduce((sum, { score }) => sum + (score ?? 0), 0);
```

Sort ascending (lower = better).

### Realtime updates
`LeaderboardClient` subscribes to `golfer_stats` changes. Initial scores come from server-computed `ranked` prop (scores baked into each entry). Realtime updates `statsMap` incrementally — the useMemo recalculates affected entries without a full page reload.

### Expand/collapse rows
```ts
// Own picks: always expandable
// Others' picks: only expandable when picks_locked = true
canExpand = picksLocked || entry.userId === currentUserId
// currentUserId resolved client-side via supabase.auth.getUser()
```

---

## 10. Field Browser

Server component + client component split. ISR (`revalidate = 60`) using service role.

**Optimisation**: Only fetch picks + profiles when `picks_locked = true`. The pickers dropdown is hidden pre-tournament, so those queries are skipped entirely:

```ts
const [golfers, stats, config] = await Promise.all([...]);
const picksLocked = config?.picks_locked ?? false;

let pickers: Record<string, string[]> = {};
if (picksLocked) {
  // fetch picks + profiles (2 extra queries, sequential)
}
```

Client features: search, category filter pills, sort (total/round/thru/tee), My Picks filter, per-row pickers dropdown (locked only), Realtime score updates.

---

## 11. Live Data Sync

### Vercel Cron
`vercel.json`:
```json
{
  "crons": [{ "path": "/api/golf-stats", "schedule": "* * * * *" }]
}
```
Runs every minute. Protected by `Authorization: Bearer <CRON_SECRET>` header.

### Sync route
1. Validate bearer token
2. Fetch from ESPN unofficial API
3. For each competitor: upsert `golfers` + upsert `golfer_stats`
4. Auto-set `is_longshot = true` for any golfer with `odds >= 10000`

### Finding the ESPN event ID
```
https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga
```

---

## 12. Security Checklist

- [ ] All DB writes go through server-side routes or RLS-protected SDK calls
- [ ] No raw SQL string interpolation — use parameterised Supabase SDK only
- [ ] All user content rendered as JSX text (auto-escaped)
- [ ] Cron route protected by `CRON_SECRET` bearer token
- [ ] Service role key only used server-side, never in client bundle
- [ ] RLS enabled on every table
- [ ] Display names have a unique constraint — checked at upsert time

---

## 13. Pre-Event Checklist

Run ~1 week before the event starts:

- [ ] Update `MASTERS_EVENT_ID` in `api/golf-stats/route.ts`
- [ ] Update `LIV_GOLFERS` set with this year's LIV members
- [ ] Pull real odds and update `odds` column
- [ ] Add new golfers — set `region`, `is_liv`, `is_longshot`
- [ ] Run sync-players script for `is_young_gun`
- [ ] Run Past Champs SQL update
- [ ] Add `tournament_config` row for the new year
- [ ] Confirm Vercel Cron is active + `CRON_SECRET` is set
- [ ] Test cron endpoint manually

### To lock picks
Supabase Table Editor → `tournament_config` → `picks_locked = true`. No redeployment.

---

## 14. File Structure Reference

```
src/
├── app/
│   ├── api/
│   │   ├── golf-stats/route.ts      # Cron — syncs ESPN data every minute
│   │   └── picks/route.ts           # GET/POST picks for current user
│   ├── auth/
│   │   ├── callback/route.ts        # OAuth/magic link callback
│   │   └── login/page.tsx           # Email + password sign in / sign up
│   ├── field/
│   │   ├── page.tsx                 # Server component (ISR, service role)
│   │   └── FieldClient.tsx          # Client component (search/filter/sort/realtime)
│   ├── leaderboard/page.tsx         # Server component (ISR, service role)
│   ├── picks/page.tsx               # Server component (dynamic, auth required)
│   ├── settings/
│   │   ├── page.tsx                 # Server component with Suspense
│   │   └── SettingsForm.tsx         # Client component (form interactions)
│   ├── globals.css                  # Design tokens + component classes
│   ├── layout.tsx                   # Root layout
│   └── page.tsx                     # How It Works / home page (force-static)
├── components/
│   ├── BottomTabs.tsx               # Mobile bottom nav — 4 tabs (md:hidden)
│   ├── GlowBackground.tsx           # Fixed decorative gradient divs
│   ├── LeaderboardClient.tsx        # Leaderboard with Realtime updates
│   ├── PicksForm.tsx                # Picks form — roster/editing modes (client)
│   └── TopNav.tsx                   # Sticky top nav with desktop links
├── lib/supabase/
│   ├── client.ts                    # Browser client
│   └── server.ts                    # Server client (cookie handling)
├── middleware.ts                    # Auth protection (protected routes only)
└── types/index.ts                   # Shared types + PICK_CATEGORIES + TOURNAMENT_YEAR

scripts/
└── sync-players.js                  # Seeds/updates golfer field + young gun flags

docs/
├── data-sources.md                  # How to update live data each year
└── pool-site-blueprint.md           # This file

vercel.json                          # Cron schedule config
```

---

## 15. Adapting for Other Sports

### Common adaptation steps
1. Update `--accent`, `--gold`, background in `globals.css`
2. Redefine `PICK_CATEGORIES` in `types/index.ts`
3. Update `picks` table columns to match categories
4. Decide: geographic `region` column (mutually exclusive) vs boolean flags (multi-category)
5. Update `golfers` / `contestants` table schema
6. Update the sync route with new ESPN endpoint + scoring logic
7. Update `EVENT_ID` constant annually
8. Update site title/metadata in `layout.tsx`
9. Update bottom tab labels and icons in `BottomTabs.tsx`

### Football Playoffs
- Categories: AFC pick, NFC pick, Super Bowl pick, top scorer
- ESPN: `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- Theme: dark navy + red

### March Madness
- Categories: bracket regions (East, West, South, Midwest) + overall winner
- ESPN: `https://site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`
- Theme: dark indigo + amber
