import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Called by Vercel Cron every minute during the tournament.
// Fetches the Masters leaderboard from ESPN and syncs scores into golfer_stats.

const MASTERS_EVENT_ID = process.env.MASTERS_EVENT_ID;
const ESPN_URL = MASTERS_EVENT_ID
  ? `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${MASTERS_EVENT_ID}`
  : null;

export async function GET(request: Request) {
  if (!ESPN_URL) {
    return NextResponse.json(
      { error: "Missing MASTERS_EVENT_ID environment variable" },
      { status: 500 }
    );
  }

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
    const competition = data?.events?.[0]?.competitions?.[0];
    const competitors = competition?.competitors ?? [];

    if (competitors.length === 0) {
      return NextResponse.json({ message: "No competitors found" });
    }

    // Don't overwrite scores if the tournament is complete — ESPN zeroes out data post-event
    const eventState: string = competition?.status?.type?.state ?? "pre";
    if (eventState === "post") {
      return NextResponse.json({ message: "Tournament complete — scores preserved" });
    }

    const year = new Date().getFullYear();
    const currentRound: number = competition?.status?.period || 1;

    // Load golfers + already-cut players in parallel
    const [{ data: golfers }, { data: existingStats }] = await Promise.all([
      supabase.from("golfers").select("id, name"),
      supabase.from("golfer_stats").select("golfer_id, score, status").eq("year", year),
    ]);

    const golferIdByName = Object.fromEntries(
      (golfers ?? []).map((g: { id: string; name: string }) => [g.name, g.id])
    );

    // Map of existing DB stats keyed by golfer_id
    const existingByGolferId = Object.fromEntries(
      (existingStats ?? []).map((r: { golfer_id: string; score: number | null; status: string }) => [r.golfer_id, r])
    );

    // Skip golfers already recorded as MC — they're fully locked in
    const alreadyCut = new Set(
      (existingStats ?? [])
        .filter((r: { status: string }) => r.status === "mc")
        .map((r: { golfer_id: string }) => r.golfer_id)
    );

    const updates: Record<string, unknown>[] = [];

    for (const comp of competitors) {
      const name: string = comp.athlete?.displayName ?? "";
      const golferId = golferIdByName[name];
      if (!golferId) continue;
      if (alreadyCut.has(golferId)) continue;

      // Score to par
      const parScore = comp.statistics?.find(
        (s: { name: string }) => s.name === "scoreToPar"
      )?.displayValue;
      const parsedPar = parScore === "E" ? 0 : parseInt(parScore ?? "");
      const score = Number.isFinite(parsedPar) ? parsedPar : null;

      // Status
      const statusName: string = comp.status?.type?.name?.toLowerCase() ?? "";
      const state: string = comp.status?.type?.state ?? "pre";
      const status =
        statusName.includes("cut") ? "mc" :
        statusName.includes("wd") || statusName.includes("withdraw") ? "wd" :
        state === "post" ? "complete" :
        state === "in" ? "active" : "notstarted";

      // Round score and tee time from linescores
      const linescores: { value?: number; displayValue?: string; teeTime?: string }[] = comp.linescores ?? [];
      const currentLinescore = linescores[currentRound - 1];
      // Use displayValue (net score to par, e.g. "+1", "E", "-4") instead of raw strokes
      const roundDisplay = currentLinescore?.displayValue;
      const parsedRound = roundDisplay === "E" ? 0 : roundDisplay && roundDisplay !== "-" ? parseInt(roundDisplay) : null;
      const roundScore = Number.isFinite(parsedRound ?? NaN) ? parsedRound : null;
      const teeTime = currentLinescore?.teeTime ?? null;

      // For MC players: update status but keep the score we already have in the DB.
      // ESPN zeroes scores after the cut — we never trust their score once mc is set.
      const finalScore = status === "mc"
        ? (existingByGolferId[golferId]?.score ?? score)
        : score;

      updates.push({
        golfer_id: golferId,
        year,
        score: finalScore,
        position: comp.sortOrder ?? null,
        status,
        thru: status === "mc" ? null : (state === "in" ? (comp.status?.period ?? null) : null),
        round: currentRound,
        round_score: status === "mc" ? null : roundScore,
        tee_time: status === "mc" ? null : teeTime,
        updated_at: new Date().toISOString(),
      });
    }

    if (updates.length > 0) {
      const { error } = await supabase
        .from("golfer_stats")
        .upsert(updates, { onConflict: "golfer_id,year" });

      if (error) {
        console.error("[golf-stats] upsert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
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
