import { createClient } from "@/lib/supabase/server";
import { TOURNAMENT_YEAR } from "@/types";
import GolfersClient from "@/components/GolfersClient";

export default async function GolfersPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: golfers }, { data: stats }, { data: picks }] = await Promise.all([
    supabase.from("golfers").select("*"),
    supabase
      .from("golfer_stats")
      .select("golfer_id, score, round_score, position, status, thru, round")
      .eq("year", TOURNAMENT_YEAR),
    user
      ? supabase
          .from("picks")
          .select("usa_pick, european_pick, asian_pick, longshot_pick, liv_pick, senior_pick")
          .eq("user_id", user.id)
          .eq("year", TOURNAMENT_YEAR)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const allStats = stats ?? [];
  const tournamentStarted = allStats.some(
    (s) => s.status !== "notstarted" && s.score !== null
  );
  const currentRound = allStats.find((s) => s.round)?.round ?? null;

  const rosterIds = new Set(
    picks
      ? Object.values(picks).filter((v): v is string => typeof v === "string")
      : []
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Field</h1>
          <p className="text-sm text-[var(--muted-light)] mt-1">
            {TOURNAMENT_YEAR} Masters · {(golfers ?? []).length} golfers
          </p>
        </div>
        {currentRound && (
          <div className="glass-card-sm px-3 py-2 text-center shrink-0">
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Round</p>
            <p className="text-xl font-bold text-[var(--gold-light)]">{currentRound}</p>
          </div>
        )}
      </div>

      <GolfersClient
        golfers={golfers ?? []}
        stats={allStats}
        tournamentStarted={tournamentStarted}
        currentRound={currentRound}
        rosterIds={Array.from(rosterIds)}
      />
    </div>
  );
}
