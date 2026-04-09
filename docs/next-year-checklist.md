# Next Year Checklist (2027 Masters)

Everything you need to reset and run the pool for the next tournament.

---

## 1. Before Picks Open (~2 weeks out)

### Update the tournament year
In `src/types/index.ts`, bump the constant:
```ts
export const TOURNAMENT_YEAR = 2027;
```

### Update the ESPN Event ID
Find the new Masters event ID from the ESPN API URL and update `.env` (and Vercel env vars):
```
MASTERS_EVENT_ID=xxxxxxxxx
```
To find the new ID: search ESPN's golf leaderboard during Masters week and grab the `event=` param from the URL.

### Update the golfer list
The field changes every year. Update the `golfers` table in Supabase with the new invite list. Key things to check:
- New LIV players (LIV lineup changes)
- Past champions (anyone new from last year)
- Young guns (U-30 — ages change, players age out)
- Longshots (subjective, update based on current odds)
- Any retired or injured players to remove

---

## 2. Reset the Database

Run these in order in Supabase SQL editor:

```sql
-- 1. Clear picks (do this FIRST before clearing profiles)
DELETE FROM picks WHERE year = 2026;

-- 2. Clear golfer stats from last year
DELETE FROM golfer_stats WHERE year = 2026;

-- 3. Reset tournament config for new year
UPDATE tournament_config SET picks_locked = false, year = 2027 WHERE year = 2026;
-- OR insert new row if keeping history:
INSERT INTO tournament_config (year, picks_locked) VALUES (2027, false);
```

> **Do NOT delete auth.users or profiles** — returning players will log back in and their account is preserved. Only delete picks.

---

## 3. Unlock Picks

In Supabase:
```sql
UPDATE tournament_config SET picks_locked = false WHERE year = 2027;
```

Or flip it in the admin panel if you build one.

---

## 4. Lock Picks (Masters Thursday morning)

Lock before the first tee time:
```sql
UPDATE tournament_config SET picks_locked = true WHERE year = 2027;
```

Once locked:
- The picks form is disabled
- The field page dropdown opens (shows who picked who)
- Tiebreaker guess should already be collected in the picks form (see section 7)

---

## 5. Cron Job (Vercel)

The cron at `/api/golf-stats` runs every minute during the tournament. Verify in Vercel dashboard that it's firing. It:
- Fetches the ESPN leaderboard
- Writes scores to `golfer_stats`
- Skips players already marked MC (preserves their cut score)
- Stops updating if `eventState === "post"` (tournament complete)

**Important:** ESPN zeroes out scores after the tournament ends. The `post` state guard prevents overwriting real scores with zeros.

---

## 6. Manually Adding Picks

If someone can't log in or submits via text/email, add their picks directly via SQL. Steps:

1. Check if auth user exists:
```sql
SELECT id FROM auth.users WHERE email = 'email@example.com';
```

2. Look up golfer IDs:
```sql
SELECT id, name FROM golfers WHERE name ILIKE '%lastname%';
```

3. Insert picks:
```sql
INSERT INTO picks (user_id, year, usa_pick, european_pick, international_pick, longshot_pick, liv_pick, past_champ_pick, young_guns_pick, submitted_at)
VALUES ('user-uuid', 2027, 'golfer-uuid', ..., now());
```

4. Fix display name if it defaulted to email:
```sql
UPDATE profiles SET display_name = 'Name' WHERE id = 'user-uuid';
```

---

## 7. Tiebreaker

`guessed_score` (integer) was added to the `picks` table in 2026. The column already exists — no migration needed.

### What to do differently in 2027
In 2026, the guess was collected via a modal on the leaderboard page after picks were submitted. **Next year, move the guess into the picks form itself** so it's collected upfront before picks lock.

- Add a number input to `src/components/PicksForm.tsx` for the winning score guess
- Submit it alongside the rest of the picks
- **Remove the `guessed_score` modal from `src/components/LeaderboardClient.tsx`** — it was a 2026 workaround and is no longer needed once the picks form collects it

### Tiebreaker logic (still to build)
The leaderboard currently ranks by total score only. When two entries tie, resolve by closest `guessed_score` to the actual winning score. The actual winning score = the lowest `score` in `golfer_stats` at end of tournament.

### Manually set a guess
```sql
UPDATE picks SET guessed_score = -18 WHERE user_id = 'uuid' AND year = 2027;
```

---

## 8. Key Files

| File | Purpose |
|---|---|
| `src/types/index.ts` | `TOURNAMENT_YEAR` constant |
| `src/app/api/golf-stats/route.ts` | ESPN cron sync |
| `src/app/picks/page.tsx` | Picks form page |
| `src/app/leaderboard/page.tsx` | Leaderboard (server) |
| `src/components/LeaderboardClient.tsx` | Leaderboard (client, realtime, tiebreaker modal) |
| `src/app/field/FieldClient.tsx` | Field page with live scores |
| `.env` | `MASTERS_EVENT_ID`, Supabase keys, `CRON_SECRET` |

---

## 9. Schema Cleanup (do when resetting)

- **`picks.locked` column is unused** — it never gets updated and the app doesn't read it. Tournament lock state comes entirely from `tournament_config.picks_locked`. Safe to drop:
```sql
ALTER TABLE picks DROP COLUMN locked;
```

---

## 10. Things That Bit Us in 2026

- **ESPN zeroes scores post-tournament** — the `eventState === "post"` guard in the cron prevents overwriting. Don't remove it.
- **ESPN also zeroes MC players** — `alreadyCut` set in the cron skips re-writing players already marked MC. Their last real score is preserved.
- **Round score was raw strokes** — ESPN `linescores[].value` is raw strokes; `displayValue` is net to par. We use `displayValue` now.
- **Windows doesn't render emoji flags** — replaced with SVG components from `country-flag-icons`.
- **Picks form jumping to top** — was caused by `sr-only` radio inputs being focused. Replaced with `<button type="button">`.
- **Node.js OOM on dev** — `NODE_OPTIONS=--max-old-space-size=4096` in package.json scripts via `cross-env`. Dev server leaks memory over hours; restart periodically.
