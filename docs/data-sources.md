# Data Sources Guide

How to update live golfer data and odds before each Masters Tournament.

---

## 1. Live Scores — ESPN API (already built, free)

The cron job at `src/app/api/golf-stats/route.ts` pulls live scores from ESPN's unofficial API every 60 seconds during the tournament via Vercel Cron.

**What it syncs each run:**
- Golfer name, country, geographic region, `is_liv` flag, world ranking
- Tournament position, total score to par, current round score, holes played (`thru`), status
- `round_score` — the current round's score relative to par (from ESPN `linescores` array)
- `tee_time` — scheduled tee time for the current round
- `status` — `active` / `mc` / `wd` / `notstarted` / `complete`

### Find the new Masters Event ID each year
1. Open `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga` in a browser
2. Find the Masters event in the JSON — grab its `id` field
3. Update the constant in `golf-stats/route.ts`:
   ```ts
   const MASTERS_EVENT_ID = "401703511"; // replace each year
   ```

### Update the LIV golfer list
`LIV_GOLFERS` in `golf-stats/route.ts` controls which players get `is_liv = true`. Update each year:
```ts
const LIV_GOLFERS = new Set([
  "Brooks Koepka",
  "Bryson DeChambeau",
  // etc.
]);
```

> **Note:** Geographic region (`usa`/`european`/`international`) is separate from the LIV flag. A US-born LIV golfer gets `region = 'usa'` AND `is_liv = true` — he appears in both the USA picks list and the LIV picks list.

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

**Option B — SQL**
```sql
UPDATE public.golfers SET odds = 5000 WHERE name = 'Rory McIlroy';
-- Longshots auto-flagged by cron when odds >= 10000
```

---

## 3. Managing Category Flags

The golfers table uses boolean flags that control which pick categories a golfer appears in. Geographic region (`usa`/`european`/`international`) is separate and mutually exclusive.

| Flag | Meaning | How to set |
|---|---|---|
| `is_liv` | LIV Golf tour member | Auto-set by cron via `LIV_GOLFERS` set |
| `is_longshot` | +10000 odds or greater | Auto-set by cron for any `odds >= 10000` |
| `is_past_champ` | Former Masters champion | **Manual only** — set in Supabase Table Editor |
| `is_young_gun` | Under 30 years old | Auto-set by `scripts/sync-players.js` |

### Setting Past Champs each year
```sql
-- Mark known Masters champions in this year's field
UPDATE public.golfers SET is_past_champ = true WHERE name IN (
  'Tiger Woods', 'Phil Mickelson', 'Bubba Watson', 'Adam Scott',
  'Sergio Garcia', 'Patrick Reed', 'Dustin Johnson', 'Hideki Matsuyama',
  'Scottie Scheffler', 'Jon Rahm', 'Rory McIlroy'
  -- add/remove based on actual field each year
);

-- Clear past champs who are not in this year's field
UPDATE public.golfers SET is_past_champ = false WHERE name = 'Someone Who Withdrew';
```

### Setting Young Guns
Run the sync-players script — it automatically sets `is_young_gun = true` for any golfer born within the last 30 years:
```bash
node scripts/sync-players.js
```

Or set manually in Supabase:
```sql
-- Mark golfers under 30 at time of tournament
UPDATE public.golfers SET is_young_gun = true WHERE name IN (
  'Ludvig Åberg', 'Nicolai Højgaard', 'Akshay Bhatia'
  -- etc.
);
```

---

## 4. Pre-Tournament Checklist (run ~1 week before the Masters)

- [ ] Confirm Masters field is finalised (Augusta National announces ~2 weeks before)
- [ ] Update `MASTERS_EVENT_ID` in `golf-stats/route.ts`
- [ ] Update `LIV_GOLFERS` set in `golf-stats/route.ts` with this year's LIV members
- [ ] Pull real odds from The Odds API and update `odds` column in `golfers` table
- [ ] Add any new golfers not already in DB — set `region`, `is_liv`, `is_longshot` as applicable
- [ ] Run `sync-players` script to auto-set `is_young_gun` (under 30)
- [ ] Run `is_past_champ` SQL update to mark/unmark Past Champs for this year's field
- [ ] Remove or deactivate golfers who did not receive invitations
- [ ] Add `tournament_config` row for the new year:
  ```sql
  INSERT INTO tournament_config (year, picks_locked) VALUES (2026, false);
  ```
- [ ] Confirm Vercel Cron is active and `CRON_SECRET` env var is set in Vercel dashboard
- [ ] Test the cron endpoint manually: `GET /api/golf-stats` with `Authorization: Bearer <CRON_SECRET>`

---

## 5. Locking Picks

When the tournament starts (first tee shot Thursday morning):

**Recommended — Global lock**
In Supabase dashboard → Table Editor → `tournament_config` → set `picks_locked = true` for the current year. Instant, no redeployment.

**Belt-and-suspenders — Row-level lock**
```sql
UPDATE public.picks SET locked = true WHERE year = 2026;
```

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
| `tee_time` | timestamptz | Scheduled tee time for current round |
| `status` | text | `active` / `mc` / `wd` / `notstarted` / `complete` |

`round_score` is populated from ESPN's `comp.linescores[currentRound - 1].value` each sync.

Missed-cut golfers (`status = 'mc'`) contribute their actual score at the time they were cut to their picker's total.
