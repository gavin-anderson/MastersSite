import { Suspense } from "react";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { TOURNAMENT_YEAR } from "@/types";
import FieldClient, { GolferRow } from "./FieldClient";

export const revalidate = 60;

const PICK_COLS = ["usa_pick", "european_pick", "international_pick", "longshot_pick", "liv_pick", "past_champ_pick", "young_guns_pick"] as const;

async function FieldContent() {
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: golfers },
    { data: stats },
    { data: config },
  ] = await Promise.all([
    service
      .from("golfers")
      .select("id, name, country, image_url, is_liv, is_longshot, is_past_champ, is_young_gun, region"),
    service
      .from("golfer_stats")
      .select("golfer_id, score, round_score, position, status, thru, round, tee_time")
      .eq("year", TOURNAMENT_YEAR),
    service
      .from("tournament_config")
      .select("picks_locked")
      .eq("year", TOURNAMENT_YEAR)
      .maybeSingle(),
  ]);

  if (!golfers?.length) {
    return (
      <div className="glass-card p-12 text-center space-y-3">
        <div className="text-4xl">📅</div>
        <p className="font-medium">Field not yet available</p>
        <p className="text-sm text-[var(--muted)]">Run sync-players to populate the field.</p>
      </div>
    );
  }

  const picksLocked = config?.picks_locked ?? false;
  const statById = Object.fromEntries((stats ?? []).map((s) => [s.golfer_id, s]));
  const currentRound = (stats ?? []).reduce((max, s) => Math.max(max, s.round ?? 1), 1);

  // Only fetch picks + profiles when locked (pickers dropdown hidden otherwise)
  let pickers: Record<string, string[]> = {};
  if (picksLocked) {
    const { data: picks } = await service
      .from("picks")
      .select("user_id, usa_pick, european_pick, international_pick, longshot_pick, liv_pick, past_champ_pick, young_guns_pick")
      .eq("year", TOURNAMENT_YEAR);

    const userIds = (picks ?? []).map((p) => p.user_id);
    const { data: profiles } = userIds.length
      ? await service.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const profileMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name])
    );

    for (const pick of picks ?? []) {
      const displayName = profileMap[pick.user_id];
      if (!displayName) continue;
      for (const col of PICK_COLS) {
        const golferId = pick[col];
        if (golferId) {
          if (!pickers[golferId]) pickers[golferId] = [];
          pickers[golferId].push(displayName);
        }
      }
    }
  }

  const rows: GolferRow[] = golfers.map((g) => {
    const stat = statById[g.id] ?? null;
    const rawStatus = stat?.status ?? "notstarted";
    const status: GolferRow["status"] =
      rawStatus === "complete" ? "finished" :
      rawStatus === "active" ? "active" :
      rawStatus === "mc" ? "mc" :
      rawStatus === "wd" ? "wd" :
      "notstarted";

    return {
      golfer_id: g.id,
      name: g.name,
      country: g.country ?? "",
      status,
      thru: stat?.thru ?? null,
      score: stat?.score ?? null,
      roundScore: stat?.round_score ?? null,
      teeTime: stat?.tee_time ?? null,
      image_url: g.image_url ?? null,
      is_liv: g.is_liv ?? false,
      is_longshot: g.is_longshot ?? false,
      is_past_champ: g.is_past_champ ?? false,
      is_young_gun: g.is_young_gun ?? false,
      region: g.region ?? "",
    };
  });

  return (
    <>
      <p className="text-sm text-[var(--muted-light)] -mt-4">
        {TOURNAMENT_YEAR} Masters · Round {currentRound}
      </p>
      <FieldClient golfers={rows} currentRound={currentRound} pickers={pickers} picksLocked={picksLocked} />
      <p className="text-xs text-[var(--muted)] text-center pb-2">
        Updates every 60 seconds · All times Eastern
      </p>
    </>
  );
}

function FieldSkeleton() {
  return (
    <>
      <div className="h-4 w-40 rounded bg-white/[0.04] animate-pulse -mt-4" />
      {/* Search bar */}
      <div className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />
      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-7 w-14 rounded-full bg-white/[0.04] animate-pulse" />
        ))}
      </div>
      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="h-9 bg-white/[0.03] border-b border-gray-700/50" />
        {[...Array(10)].map((_, i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < 9 ? "border-b border-gray-700/50" : ""}`}>
            <div className="w-5 h-4 rounded bg-white/[0.06] animate-pulse shrink-0" />
            <div className="w-7 h-7 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
            <div className="flex-1 h-4 rounded bg-white/[0.06] animate-pulse" />
            <div className="w-8 h-4 rounded bg-white/[0.06] animate-pulse" />
            <div className="w-10 h-4 rounded bg-white/[0.06] animate-pulse" />
            <div className="w-8 h-4 rounded bg-white/[0.06] animate-pulse" />
          </div>
        ))}
      </div>
    </>
  );
}

export default function FieldPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight">Field</h1>
      <Suspense fallback={<FieldSkeleton />}>
        <FieldContent />
      </Suspense>
    </div>
  );
}
