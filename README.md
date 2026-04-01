# The Masters Pool

A friend-group golf pool app for the Masters Tournament. Players pick one golfer per category before the tournament starts, then watch a live leaderboard update throughout the week.

Built with Next.js 14, Supabase, and Tailwind CSS. Deployed on Vercel.

---

## Features

- **Magic link auth** — sign in with just an email, no passwords
- **Pick submissions** — one golfer per category (American, European, Asian, Longshot, LIV)
- **Live leaderboard** — scores sync every 10 minutes via ESPN API during the tournament
- **Real-time chat** — live pool chat on the leaderboard page (visible after picks are submitted)
- **Pick locking** — picks are locked globally via a single toggle in Supabase before the tournament starts
- **Augusta-inspired design** — dark green glassmorphism theme, responsive for iPhone through Mac Pro

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the Supabase SQL Editor, run the contents of `supabase/schema.sql` — this creates all tables and seeds the 2025 Masters golfer field

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

All three Supabase keys are in your project dashboard → **Project Settings → API**.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push the repo to GitHub
2. Import it in [Vercel](https://vercel.com)
3. Add the four environment variables from `.env.local` in Vercel's project settings
4. In Supabase → **Authentication → URL Configuration**, add your Vercel domain as a redirect URL:
   ```
   https://your-domain.vercel.app/auth/callback
   ```
5. Deploy — the cron job in `vercel.json` activates automatically

---

## Before the Tournament

Run through these steps ~1 week before the Masters starts:

1. **Update the golfer field** — edit the seed data in `supabase/schema.sql` or update rows directly in Supabase Table Editor → `golfers`
2. **Update the ESPN event ID** — find the new Masters event ID and update `MASTERS_EVENT_ID` in `src/app/api/golf-stats/route.ts`
3. **Update the LIV golfer list** — update the `LIV_GOLFERS` set in the same file
4. **Update odds** — see `docs/data-sources.md` for how to pull real odds from The Odds API

See `docs/data-sources.md` for the full pre-tournament checklist.

### Locking picks

When the first tee shot goes off on Thursday, flip `picks_locked` to `true` in:

**Supabase dashboard → Table Editor → `tournament_config`**

No redeployment needed. Picks immediately become read-only for all users.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── golf-stats/     # Cron job — syncs live scores from ESPN
│   │   └── picks/          # Picks read/write API
│   ├── auth/               # Login page + OAuth callback
│   ├── golfers/            # Browse the full field
│   ├── leaderboard/        # Live leaderboard + chat
│   ├── picks/              # Submit and edit picks
│   └── settings/           # Display name + sign out
├── components/
│   ├── BottomTabs.tsx      # Mobile bottom nav
│   ├── Chat.tsx            # Real-time chat panel
│   ├── GlowBackground.tsx  # Decorative background gradients
│   ├── PicksForm.tsx       # Pick submission form
│   └── TopNav.tsx          # Top navigation bar
├── lib/supabase/           # Supabase client helpers (browser + server)
├── middleware.ts            # Auth route protection
└── types/                  # Shared TypeScript types

supabase/
└── schema.sql              # Full database schema + golfer seed data

docs/
├── data-sources.md         # How to update live data each year
└── pool-site-blueprint.md  # Full blueprint for building similar pool sites
```

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (magic link) |
| Realtime | Supabase Realtime (chat) |
| Hosting | Vercel |
| Cron | Vercel Cron Jobs |
| Live scores | ESPN unofficial API |
