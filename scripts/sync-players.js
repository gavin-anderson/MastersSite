#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Masters Pool — Player Sync
// Usage: node --env-file=.env scripts/sync-players.js
//
// 1. Fetches the Masters field from the ESPN leaderboard API
// 2. Merges in any manually-listed players ESPN omits
// 3. Computes tags: region, is_liv, is_fossil (40+), is_longshot (odds > +10000)
// 4. Upserts everything into the Supabase `golfers` table
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require("@supabase/supabase-js");
const {
  EVENT_ID,
  LIV_PLAYERS,
  BIRTH_YEARS,
  MANUAL_PLAYERS,
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


async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log(`Fetching ESPN field for event ${EVENT_ID}…`);
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
    const image_url = comp.athlete?.headshot?.href ?? null;

    if (name) {
      playerMap.set(name, { name, country, image_url });
    }
  }

  // Merge manual players ESPN omits
  for (const manual of MANUAL_PLAYERS) {
    if (!playerMap.has(manual.name)) {
      playerMap.set(manual.name, {
        name: manual.name,
        country: manual.country ?? null,
        image_url: null,
      });
      console.log(`  + Manual add: ${manual.name}`);
    }
  }

  // Build upsert payload
  const upserts = [];

  for (const { name, country, image_url } of playerMap.values()) {
    const isLiv = LIV_PLAYERS.has(name);
    const fossil = isFossil(name, tournamentYear);
    const odds = ODDS[name] ?? null;
    const longshot = odds != null && odds > 10000;
    const region = getRegion(country);

    upserts.push({
      name,
      country,
      region,
      tour: isLiv ? "liv" : "pga",
      is_liv: isLiv,
      is_senior: fossil,
      is_longshot: longshot,
      odds,
      image_url,
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

  console.log(`\nDone — ${upserts.length} players synced`);
  console.log(`  Fossils   (${fossils.length}): ${fossils.join(", ")}`);
  console.log(`  LIV       (${liv.length}): ${liv.join(", ")}`);
  console.log(`  Longshots (${longshots.length}): ${longshots.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});