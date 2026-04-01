# Data Sources Guide

How to replace hardcoded golfer data with real live data before each Masters Tournament.

---

## 1. Live Scores — ESPN API (already built, free)

The cron job at `src/app/api/golf-stats/route.ts` pulls live scores from ESPN's unofficial API every 10 minutes during the tournament via Vercel Cron.

**What it syncs each run:**
- Golfer name, country, geographic region, `is_liv` flag, world ranking
- Tournament position, total score to par, current round score, holes played (`thru`), status
- `round_score` — the current round's score relative to par (from ESPN `linescores` array)

### Find the new Masters Event ID each year
1. Open `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga` in a browser
2. Find the Masters event in the JSON — grab its `id` field
3. Update the constant in `golf-stats/route.ts`:
   ```ts
   const MASTERS_EVENT_ID = "401703511"; // replace each year
   ```

### Update the LIV golfer list
`LIV_GOLFERS` in `golf-stats/route.ts` controls which players get `is_liv = true`. The cron job also uses `tour = 'liv'` as a secondary signal. Update the set each year:
```ts
const LIV_GOLFERS = new Set([
  "Brooks Koepka",
  "Bryson DeChambeau",
  // etc.
]);
```
> **Note:** Geographic region (`usa`/`european`/`asian`/`other`) is now separate from the LIV flag. A US-born LIV golfer gets `region = 'usa'` AND `is_liv = true` — he appears in both the USA picks list and the LIV picks list.

> **Note:** ESPN's API is unofficial and undocumented. It can change without warning. If it breaks, inspect the ESPN website's network requests for an updated endpoint.

---

## 2. Golfer Field & Odds — The Odds API (free tier available)

For real pre-tournament odds and the confirmed Masters field, use [The Odds API](https://the-odds-api.com).

- Free tier: 500 requests/month — plenty for a one-time pre-tournament update
- Sign up at `the-odds-api.com` → get an API key

### Fetch current Masters odds
```bash
curl "https://api.the-odds-api.com/v4/sports/golf_masters_tournament_winner/odds/?apiKey=YOUR_KEY&regions=us&markets=outrights"
```

Map the `price` field (American odds, e.g. `+5000`) to the `odds` column (store as integer `5000`).

### Update the database
**Option A — Supabase Table Editor**
Dashboard → Table Editor → `golfers`. Edit rows directly. Best for small changes.

**Option B — SQL (re-run seed block)**
Replace the seed values in `supabase/schema.sql` with the real field and odds, then run the block in the SQL Editor. The `ON CONFLICT (name) DO UPDATE` clause prevents duplicates.

---

## 3. Managing Category Flags

The golfers table uses three boolean flags that control which pick categories a golfer appears in. Geographic region (`usa`/`european`/`asian`/`other`) is separate and mutually exclusive.

| Flag | Meaning | How to set |
|---|---|---|
| `is_liv` | LIV Golf tour member | Auto-set by cron job via `LIV_GOLFERS` set + `tour = 'liv'` |
| `is_longshot` | 100-1 odds or greater | Auto-set by cron for any `odds >= 10000`; set manually otherwise |
| `is_senior` | Aged 50 or over (Fossils category) | **Manual only** — set in Supabase Table Editor or SQL |

### Setting Fossils (is_senior) each year
The cron job cannot determine age from ESPN data, so mark eligible golfers manually before the tournament:
```sql
-- Mark known 50+ players competing this year
UPDATE public.golfers SET is_senior = true WHERE name IN (
  'Phil Mickelson', 'Fred Couples', 'Bernhard Langer', 'Mike Weir',
  'Ernie Els', 'Vijay Singh', 'Larry Mize', 'Sandy Lyle',
  'Padraig Harrington', 'Jose Maria Olazabal'
  -- add/remove based on actual field each year
);

-- Clear last year's seniors not in this year's field
UPDATE public.golfers SET is_senior = false WHERE name = 'Someone Who Withdrew';
```

Run this in the Supabase SQL Editor ~1 week before the tournament.

---

## 4. Pre-Tournament Checklist (run ~1 week before the Masters)

- [ ] Confirm Masters field is finalised (Augusta National announces ~2 weeks before)
- [ ] Update `MASTERS_EVENT_ID` in `golf-stats/route.ts`
- [ ] Update `LIV_GOLFERS` set in `golf-stats/route.ts` with this year's LIV members playing Augusta
- [ ] Pull real odds from The Odds API and update `odds` column in `golfers` table
- [ ] Add any new golfers not already in DB — set `region`, `is_liv`, `is_longshot`, `is_senior` as applicable
- [ ] Run the `is_senior` SQL update to mark/unmark Fossils for this year's field
- [ ] Remove or deactivate golfers who did not receive invitations
- [ ] Add `tournament_config` row for the new year: `INSERT INTO tournament_config (year, picks_locked) VALUES (2026, false)`
- [ ] Confirm Vercel Cron is active and `CRON_SECRET` env var is set in Vercel dashboard
- [ ] Test the cron endpoint manually: `GET /api/golf-stats` with `Authorization: Bearer <CRON_SECRET>`

---

## 5. Locking Picks

When the tournament starts (first tee shot Thursday morning), lock all picks:

**Option A — Global lock (recommended)**
In Supabase dashboard → Table Editor → `tournament_config` → set `picks_locked = true` for the current year. Instant, no redeployment.

**Option B — Row-level lock (belt and suspenders)**
```sql
UPDATE public.picks SET locked = true WHERE year = 2026;
```

Run in the SQL Editor right before the tournament begins.

---

## 6. golfer_stats Columns Reference

| Column | Type | Description |
|---|---|---|
| `golfer_id` | uuid | FK to golfers |
| `year` | integer | Tournament year |
| `score` | integer | Total score relative to par (negative = under) |
| `round_score` | integer | Current round score relative to par |
| `position` | integer | Current leaderboard position |
| `thru` | integer | Holes completed in current round (0–18) |
| `round` | integer | Current round number (1–4) |
| `status` | text | `active` / `mc` / `wd` / `notstarted` |

`round_score` is populated from ESPN's `comp.linescores[currentRound - 1].value` each sync.
