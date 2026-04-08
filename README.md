# The Masters Pool

A friend-group golf pool app for the Masters Tournament. Players pick one golfer per category before the tournament starts, then watch a live leaderboard update throughout the week.

Built with Next.js 15, Supabase, and Tailwind CSS. Deployed on Vercel.

---

## Features

- **Email + password auth** — sign up with an email, password, and optional display name
- **Pick submissions** — one golfer per category across seven categories
- **Live leaderboard** — scores sync every 60 seconds via ESPN API during the tournament, with Supabase Realtime pushing updates to connected clients
- **Pick locking** — picks locked globally via `tournament_config.picks_locked` in Supabase
- **Field browser** — filterable, sortable golfer list with live scores and pickers dropdown
- **Augusta-inspired design** — dark green glassmorphism theme, responsive for iPhone through desktop

---

## Pick Categories

| Category | Rule |
|---|---|
| 🇺🇸 American | Any golfer from the United States |
| 🇪🇺 European | Any golfer from a European nation |
| 🌍 International | Any golfer from outside the USA and Europe |
| 🎯 Longshot | A golfer with pre-tournament odds over +10000 |
| ⚡ LIV Golfer | Any active LIV Golf tour member |
| 🏆 Past Champ | A former Masters champion |
| 🌟 Young Guns | A golfer under 30 years old |

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the Supabase SQL Editor, run `supabase/schema.sql` — creates all tables

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CRON_SECRET=any_random_string
```

All keys are in your Supabase dashboard → **Project Settings → API**.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push the repo to GitHub
2. Import it in [Vercel](https://vercel.com)
3. Add the four environment variables in Vercel's project settings
4. In Supabase → **Authentication → URL Configuration**, add your Vercel domain as a redirect URL
5. Deploy — the cron job in `vercel.json` activates automatically

---

## Before the Tournament

Run through these steps ~1 week before the Masters starts:

1. **Update the golfer field** — update rows in Supabase Table Editor → `golfers`
2. **Update the ESPN event ID** — find the new Masters event ID and update `MASTERS_EVENT_ID` in `src/app/api/golf-stats/route.ts`
3. **Update the LIV golfer list** — update `LIV_GOLFERS` in the same file
4. **Mark Young Guns** — run `sync-players` script or manually set `is_young_gun = true` for golfers under 30
5. **Mark Past Champs** — manually set `is_past_champ = true` in the golfers table
6. **Update odds** — see `docs/data-sources.md` for how to pull real odds

See `docs/data-sources.md` for the full pre-tournament checklist.

### Locking picks

When the first tee shot goes off Thursday, flip `picks_locked` to `true` in:

**Supabase dashboard → Table Editor → `tournament_config`**

No redeployment needed. Picks immediately become read-only for all users.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── golf-stats/     # Cron job — syncs live scores from ESPN every 60s
│   │   └── picks/          # Picks read/write API
│   ├── auth/               # Login + signup page, OAuth callback
│   ├── field/              # Browse the full field (server + FieldClient)
│   ├── leaderboard/        # Live pool leaderboard
│   ├── picks/              # Submit and edit picks
│   └── settings/           # Display name + sign out
├── components/
│   ├── BottomTabs.tsx      # Mobile bottom nav (4 tabs)
│   ├── GlowBackground.tsx  # Decorative background gradients
│   ├── LeaderboardClient.tsx  # Leaderboard with Realtime updates
│   ├── PicksForm.tsx       # Pick submission form with live stats
│   └── TopNav.tsx          # Top navigation bar
├── lib/supabase/           # Supabase client helpers (browser + server)
├── middleware.ts            # Auth route protection (protected routes only)
└── types/                  # Shared TypeScript types + PICK_CATEGORIES

scripts/
└── sync-players.js         # One-time script to seed/update golfer field

docs/
├── data-sources.md         # How to update live data each year
└── pool-site-blueprint.md  # Architecture reference
```

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (email + password) |
| Realtime | Supabase Realtime (live score updates) |
| Hosting | Vercel |
| Cron | Vercel Cron Jobs (every 60 seconds) |
| Live scores | ESPN unofficial API |

---

## Performance Architecture

- **ISR + service role**: Field and leaderboard pages use the Supabase service role client (no cookies) so `export const revalidate` works. Pages are cached at the edge and revalidated on a schedule.
- **Suspense streaming**: Every page renders its shell immediately and streams data in behind a skeleton. Users see content faster even on cold cache misses.
- **Middleware optimisation**: Auth check (`supabase.auth.getUser`) only runs for protected routes (`/picks`, `/leaderboard`, `/settings`). Public pages (`/`, `/field`, `/auth/*`) bypass it entirely.
- **Conditional queries**: Field page only fetches picks + profiles when `picks_locked = true` — saves two DB round-trips pre-tournament.
