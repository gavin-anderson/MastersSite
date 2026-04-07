#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Masters Pool — Player Sync
// Usage: node --env-file=.env scripts/sync-players.js
//
// 1. Fetches world rankings from Sportradar OWGR API
// 2. Fetches the Masters field from the ESPN leaderboard API
// 3. Merges in any manually-listed players ESPN omits
// 4. Computes tags: region, is_liv, is_fossil (40+), is_longshot
// 5. Upserts everything into the Supabase `golfers` table
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require("@supabase/supabase-js");
const {
  EVENT_ID,
  LONGSHOT_PLAYERS,
  LIV_PLAYERS,
  BIRTH_YEARS,
  MANUAL_PLAYERS,
  MANUAL_RANKINGS,
  ODDS,
} = require("./player-config");

const ESPN_URL = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${EVENT_ID}`;

// Region buckets
const REGION = {
  USA: "usa",
  EU: "european",
  ASIA: "asian",
  OTHER: "other",
};

// Region should come from birthplace, stored in `country`
const COUNTRY_REGION = {
  "united states": "usa",
  "england": "european",
  "scotland": "european",
  "wales": "european",
  "northern ireland": "european",
  "ireland": "european",
  "spain": "european",
  "portugal": "european",
  "france": "european",
  "germany": "european",
  "austria": "european",
  "switzerland": "european",
  "italy": "european",
  "belgium": "european",
  "netherlands": "european",
  "denmark": "european",
  "norway": "european",
  "sweden": "european",
  "finland": "european",
  "iceland": "european",
  "poland": "european",
  "czech republic": "european",
  "slovakia": "european",
  "slovenia": "european",
  "croatia": "european",
  "greece": "european",
  "romania": "european",
  "hungary": "european",
  "bulgaria": "european",
  "estonia": "european",
  "latvia": "european",
  "lithuania": "european",
  "luxembourg": "european",
  "malta": "european",
  "cyprus": "european",
  "japan": "asian",
  "south korea": "asian",
  "china": "asian",
  "thailand": "asian",
  "chinese taipei": "asian",
  "taiwan": "asian",
  "india": "asian",
  "philippines": "asian",
};

function normalizeCountry(value) {
  return (value ?? "").trim().toLowerCase();
}

function getRegion(country) {
  return COUNTRY_REGION[normalizeCountry(country)] ?? "other";
}

function isFossil(name, tournamentYear) {
  const born = BIRTH_YEARS[name];
  if (!born) return false;
  return tournamentYear - born > 40; // strictly over 40 — born 1985 or earlier
}

// Normalize a name for fuzzy matching (remove accents + special chars, lowercase)
function normalize(name) {
  return name
    .toLowerCase()
    // Explicit replacements for chars that don't decompose via NFD
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a")
    .replace(/ð/g, "d").replace(/þ/g, "th").replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[^a-z\s-]/g, "")
    .trim();
}

async function fetchWorldRankings(year) {
  const key = process.env.SPORTRADAR_API_KEY;
  if (!key) {
    console.warn("  No SPORTRADAR_API_KEY — skipping world rankings");
    return {};
  }

  const url = `https://api.sportradar.com/golf/trial/v3/en/players/wgr/${year}/rankings.json?api_key=${encodeURIComponent(key)}`;
  console.log("Fetching Sportradar world rankings…");

  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      break;
    } catch (e) {
      if (attempt === 3) {
        console.warn(
          `  Sportradar fetch failed after 3 attempts (${e.cause?.code ?? e.message}) — skipping world rankings`
        );
        return {};
      }
      console.log(`  Attempt ${attempt} failed, retrying in 3s…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!res.ok) {
    console.warn(`  Sportradar returned ${res.status} — skipping world rankings`);
    return {};
  }

  const data = await res.json();
  const players = data?.players ?? [];
  console.log(`Sportradar returned ${players.length} ranked players`);

  // Build two lookup maps: exact full name → rank, and normalized name → rank
  const exactMap = new Map();
  const normMap = new Map();

  for (const p of players) {
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (fullName) {
      exactMap.set(fullName, p.rank);
      normMap.set(normalize(fullName), p.rank);
    }
  }

  return { exactMap, normMap };
}

function lookupRank(name, { exactMap, normMap }) {
  if (!exactMap) return null;
  return exactMap.get(name) ?? normMap.get(normalize(name)) ?? null;
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Fetch rankings first (Sportradar rate limit: avoid back-to-back requests)
  const rankings = await fetchWorldRankings(new Date().getFullYear());

  console.log(`\nFetching ESPN field for event ${EVENT_ID}…`);
  const res = await fetch(ESPN_URL, {
    headers: { "User-Agent": "masters-pool/1.0" },
  });

  if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);

  const data = await res.json();
  const competitors = data?.events?.[0]?.competitions?.[0]?.competitors ?? [];
  console.log(`ESPN returned ${competitors.length} competitors`);

  const tournamentYear = data?.events?.[0]?.season?.year ?? new Date().getFullYear();

  // Build player map from ESPN
  const playerMap = new Map();

  for (const comp of competitors) {
    const name = comp.athlete?.displayName ?? "";
    const country =
      comp.athlete?.flag?.alt ??
      comp.athlete?.flag?.description ??
      null;
  
    if (name) {
      playerMap.set(name, { name, country });
    }
  }

  // Merge manual players ESPN omits
  for (const manual of MANUAL_PLAYERS) {
    if (!playerMap.has(manual.name)) {
      playerMap.set(manual.name, {
        name: manual.name,
        country: null,
      });
      console.log(`  + Manual add: ${manual.name}`);
    }
  }

  // Build upsert payload
  const unranked = [];
  const upserts = [];

  for (const { name, country } of playerMap.values()) {
    const isLiv = LIV_PLAYERS.has(name);
    const fossil = isFossil(name, tournamentYear);
    const longshot = LONGSHOT_PLAYERS.has(name);
    const region = getRegion(country);

    // Sportradar first, fall back to manually provided OWGR data
    const world_ranking =
      lookupRank(name, rankings) ?? MANUAL_RANKINGS[name] ?? null;

    if (!world_ranking && !LONGSHOT_PLAYERS.has(name) && !isLiv && !fossil) {
      unranked.push(name);
    }

    upserts.push({
      name,
      country,
      region,
      tour: isLiv ? "liv" : "pga",
      is_liv: isLiv,
      is_senior: fossil,
      is_longshot: longshot,
      world_ranking,
      odds: ODDS[name] ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`\nUpserting ${upserts.length} players…`);
  const { error } = await supabase
    .from("golfers")
    .upsert(upserts, { onConflict: "name" });

  if (error) {
    console.error("Upsert error:", error);
    process.exit(1);
  }

  // Summary
  const fossils = upserts.filter((p) => p.is_senior).map((p) => p.name);
  const liv = upserts.filter((p) => p.is_liv).map((p) => p.name);
  const longshots = upserts.filter((p) => p.is_longshot).map((p) => p.name);
  const ranked = upserts.filter((p) => p.world_ranking).length;

  console.log(`\nDone — ${upserts.length} players synced`);
  console.log(`  World rankings populated: ${ranked}/${upserts.length}`);
  if (unranked.length) console.log(`  No ranking found for: ${unranked.join(", ")}`);
  console.log(`  Fossils   (${fossils.length}): ${fossils.join(", ")}`);
  console.log(`  LIV       (${liv.length}): ${liv.join(", ")}`);
  console.log(`  Longshots (${longshots.length}): ${longshots.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});