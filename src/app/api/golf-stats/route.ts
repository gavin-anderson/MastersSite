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
    const competitors = data?.events?.[0]?.competitions?.[0]?.competitors ?? [];

    if (competitors.length === 0) {
      return NextResponse.json({ message: "No competitors found" });
    }

    const year = new Date().getFullYear();
    const currentRound: number = data?.events?.[0]?.competitions?.[0]?.status?.period || 1;

    // Load all golfers once so we can look up IDs by name
    const { data: golfers } = await supabase
      .from("golfers")
      .select("id, name");

    const golferIdByName = Object.fromEntries(
      (golfers ?? []).map((g: { id: string; name: string }) => [g.name, g.id])
    );

    const updates: Record<string, unknown>[] = [];

    for (const comp of competitors) {
      const name: string = comp.athlete?.displayName ?? "";
      const golferId = golferIdByName[name];
      if (!golferId) continue;

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
      const linescores: { value?: number; teeTime?: string }[] = comp.linescores ?? [];
      const currentLinescore = linescores[currentRound - 1];
      const roundScore = currentLinescore?.value ?? null;
      const teeTime = currentLinescore?.teeTime ?? null;

      updates.push({
        golfer_id: golferId,
        year,
        score,
        position: comp.sortOrder ?? null,
        status,
        thru: state === "in" ? (comp.status?.period ?? null) : null,
        round: currentRound,
        round_score: roundScore,
        tee_time: teeTime,
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
