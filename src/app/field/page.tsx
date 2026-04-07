import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { TOURNAMENT_YEAR } from "@/types";
import FieldClient, { GolferRow } from "./FieldClient";

export const revalidate = 60;

const PICK_COLS = [
  "usa_pick", "european_pick", "international_pick",
  "longshot_pick", "liv_pick", "past_champ_pick", "young_guns_pick",
];

export default async function FieldPage() {
  const supabase = await createClient();

  const [{ data: golfers }, { data: stats }] = await Promise.all([
    supabase
      .from("golfers")
      .select("name, country, image_url, is_liv, is_longshot, is_past_champ, is_young_gun, region"),
    supabase
      .from("golfer_stats")
      .select("golfer_id, score, round_score, position, status, thru, round, tee_time")
      .eq("year", TOURNAMENT_YEAR),
  ]);

  if (!golfers?.length) {
    return (
      <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Field</h1>
          <p className="text-sm text-[var(--muted-light)] mt-1">{TOURNAMENT_YEAR} Masters</p>
        </div>
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl">📅</div>
          <p className="font-medium">Field not yet available</p>
          <p className="text-sm text-[var(--muted)]">Run sync-players to populate the field.</p>
        </div>
      </div>
    );
  }

  // Build a stat lookup by golfer_id — need golfer IDs too
  const { data: golferIds } = await supabase
    .from("golfers")
    .select("id, name");

  const idByName = Object.fromEntries((golferIds ?? []).map((g: { id: string; name: string }) => [g.name, g.id]));
  const statById = Object.fromEntries((stats ?? []).map((s) => [s.golfer_id, s]));

  const currentRound = (stats ?? []).reduce((max, s) => Math.max(max, s.round ?? 1), 1);

  // Build pickers map: golfer_id → [display_name, ...]
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: picks } = await service
    .from("picks")
    .select(`user_id, ${PICK_COLS.join(", ")}`)
    .eq("year", TOURNAMENT_YEAR);

  const userIds = (picks ?? []).map((p) => p.user_id);
  const { data: profiles } = userIds.length
    ? await service.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]));

  const pickers: Record<string, string[]> = {};
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

  const rows: GolferRow[] = golfers.map((g) => {
    const id = idByName[g.name];
    const stat = id ? statById[id] : null;

    const rawStatus = stat?.status ?? "notstarted";
    const status: GolferRow["status"] =
      rawStatus === "complete" ? "finished" :
      rawStatus === "active" ? "active" :
      rawStatus === "mc" ? "mc" :
      rawStatus === "wd" ? "wd" :
      "notstarted";

    return {
      golfer_id: id ?? "",
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
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Field</h1>
        <p className="text-sm text-[var(--muted-light)] mt-1">
          {TOURNAMENT_YEAR} Masters · Round {currentRound}
        </p>
      </div>

      <FieldClient golfers={rows} currentRound={currentRound} pickers={pickers} />

      <p className="text-xs text-[var(--muted)] text-center pb-2">
        Updates every 60 seconds · All times Eastern
      </p>
    </div>
  );
}
