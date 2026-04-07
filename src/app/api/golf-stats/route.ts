import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This endpoint is called by Vercel Cron every 10 minutes during the tournament.
// It fetches the Masters leaderboard from ESPN's unofficial API and syncs scores.

const MASTERS_EVENT_ID = process.env.MASTERS_EVENT_ID;
const ESPN_URL = MASTERS_EVENT_ID
  ? `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${MASTERS_EVENT_ID}`
  : null;

// Country → region mapping (expand as needed)
const COUNTRY_REGION: Record<string, string> = {
  USA: "usa",
  England: "european",
  Scotland: "european",
  Ireland: "european",
  "Northern Ireland": "european",
  Spain: "european",
  Germany: "european",
  France: "european",
  Sweden: "european",
  Denmark: "european",
  Norway: "european",
  Belgium: "european",
  Switzerland: "european",
  Italy: "european",
  Japan: "asian",
  Korea: "asian",
  "South Korea": "asian",
  China: "asian",
  Thailand: "asian",
  Taiwan: "asian",
  India: "asian",
  Philippines: "asian",
  Australia: "other",
  "South Africa": "other",
  Canada: "usa",
  Argentina: "other",
  Chile: "other",
  Colombia: "other",
  Mexico: "other",
  Venezuela: "other",
  "New Zealand": "other",
  Fiji: "other",
  "Puerto Rico": "usa",
  Austria: "european",
  Netherlands: "european",
  Finland: "european",
  "Cayman Islands": "other",
};

function getGeographicRegion(country: string): string {
  return COUNTRY_REGION[country] ?? "other";
}

// LIV golfers who also play at the Masters (update annually)
const LIV_GOLFERS = new Set([
  "Dustin Johnson",
  "Bryson DeChambeau",
  "Patrick Reed",
  "Sergio García",
  "Charl Schwartzel",
  "Brooks Koepka",
  "Tyrrell Hatton",
  "Carlos Ortiz",
  "Nico Echavarria",
  "Cameron Smith",
  "Jon Rahm",
]);

export async function GET(request: Request) {
  if (!ESPN_URL) {
    return NextResponse.json(
      { error: "Missing MASTERS_EVENT_ID environment variable" },
      { status: 500 }
    );
  }

  // Validate cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const res = await fetch(ESPN_URL, {
      headers: { "User-Agent": "masters-pool/1.0" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `ESPN API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const competitors = data?.events?.[0]?.competitions?.[0]?.competitors ?? [];

    if (competitors.length === 0) {
      return NextResponse.json({ message: "No competitors found — tournament may not have started" });
    }

    const year = new Date().getFullYear();
    const updates: Record<string, unknown>[] = [];

    for (const comp of competitors) {
      const name: string = comp.athlete?.displayName ?? "";
      const country: string = comp.athlete?.flag?.description ?? "USA";
      const isLiv = LIV_GOLFERS.has(name);
      const region = getGeographicRegion(country);

      const parScore = comp.statistics?.find(
        (s: { name: string }) => s.name === "scoreToPar"
      )?.displayValue;
      const relativePar =
        parScore === "E" ? 0 : parScore ? parseInt(parScore) : null;

      const status = comp.status?.type?.name?.toLowerCase();
      const mappedStatus =
        status === "cut" ? "mc" :
          status === "wd" ? "wd" :
            status === "active" ? "active" : "notstarted";

      const thru = comp.status?.period ?? null;

      // Current round score from linescores array
      const currentRound: number = data?.events?.[0]?.competitions?.[0]?.status?.period ?? 1;
      const linescores: { value: number }[] = comp.linescores ?? [];
      const roundScoreRaw = linescores[currentRound - 1]?.value;
      const roundScore = roundScoreRaw != null ? (roundScoreRaw === 0 ? 0 : roundScoreRaw) : null;

      // Upsert golfer
      const { data: golfer, error: golferError } = await supabase
        .from("golfers")
        .upsert(
          {
            name,
            country,
            region,
            tour: isLiv ? "liv" : "pga",
            is_liv: isLiv,
            world_ranking: comp.athlete?.ranking ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "name" }
        )
        .select("id")
        .single();

      if (golferError || !golfer) continue;

      updates.push({
        golfer_id: golfer.id,
        year,
        score: relativePar,
        position: comp.sortOrder ?? null,
        status: mappedStatus,
        thru: comp.status?.type?.name === "active" ? thru : null,
        round: currentRound,
        round_score: roundScore,
        updated_at: new Date().toISOString(),
      });
    }

    // Batch upsert stats
    if (updates.length > 0) {
      await supabase
        .from("golfer_stats")
        .upsert(updates, { onConflict: "golfer_id,year" });
    }

    return NextResponse.json({
      message: `Synced ${updates.length} golfers`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[golf-stats cron] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
