import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TOURNAMENT_YEAR } from "@/types";
import LeaderboardClient, { RankedEntry } from "@/components/LeaderboardClient";

export const dynamic = "force-dynamic";

const GOLFER_KEYS: Array<[string, string, string]> = [
  ["usa_pick",      "usa_golfer",      "usa"],
  ["european_pick", "european_golfer", "european"],
  ["asian_pick",    "asian_golfer",    "asian"],
  ["longshot_pick", "longshot_golfer", "longshot"],
  ["liv_pick",      "liv_golfer",      "liv"],
  ["senior_pick",   "senior_golfer",   "senior"],
];

async function getData() {
  const supabase = await createClient();

  const [{ data: picks, error: picksError }, { data: stats }] = await Promise.all([
    supabase
      .from("picks")
      .select(`
        *,
        usa_golfer:golfers!picks_usa_pick_fkey(id, name, country, region),
        european_golfer:golfers!picks_european_pick_fkey(id, name, country, region),
        asian_golfer:golfers!picks_asian_pick_fkey(id, name, country, region),
        longshot_golfer:golfers!picks_longshot_pick_fkey(id, name, country, region),
        liv_golfer:golfers!picks_liv_pick_fkey(id, name, country, region),
        senior_golfer:golfers!picks_senior_pick_fkey(id, name, country, region)
      `)
      .eq("year", TOURNAMENT_YEAR),
    supabase
      .from("golfer_stats")
      .select("golfer_id, score, position, status, thru")
      .eq("year", TOURNAMENT_YEAR),
  ]);

  if (picksError) console.error("[leaderboard] picks query error:", picksError);

  const userIds = (picks ?? []).map((p) => p.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]));

  return { picks: picks ?? [], stats: stats ?? [], profileMap };
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirectedFrom=/leaderboard");
  }

  const { picks, stats, profileMap } = await getData();
  const statsMap = Object.fromEntries(stats.map((s) => [s.golfer_id, s]));

  const ranked: RankedEntry[] = picks
    .map((p) => {
      const golferScores = GOLFER_KEYS.map(([pickKey, golferKey, categoryKey]) => {
        const golferId = (p as Record<string, unknown>)[pickKey] as string | null;
        const golfer = (p as Record<string, unknown>)[golferKey] as {
          id: string;
          name: string;
        } | null;
        const stat = golferId ? statsMap[golferId] : null;
        const isCut = stat?.status === "mc" || stat?.status === "cut";
        const score = isCut ? null : (stat?.score ?? null);
        return { golfer, score, stat, categoryKey };
      });

      const totalScore = golferScores.reduce((sum, { score }) => sum + (score ?? 0), 0);
      const allNoScore = golferScores.every(({ score }) => score === null);

      return {
        id: p.id,
        displayName: profileMap[p.user_id] ?? "Anonymous",
        totalScore,
        allNoScore,
        golferScores,
      };
    })
    .sort((a, b) => a.totalScore - b.totalScore);

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pool Leaderboard</h1>
        <p className="text-sm text-[var(--muted-light)] mt-1">
          {TOURNAMENT_YEAR} Masters Tournament · {picks.length} participant
          {picks.length !== 1 ? "s" : ""}
        </p>
      </div>

      {ranked.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl">🏌️</div>
          <p className="font-medium">No picks submitted yet</p>
          <p className="text-sm text-[var(--muted)]">Be the first to submit your picks!</p>
        </div>
      ) : (
        <LeaderboardClient ranked={ranked} />
      )}

      <p className="text-xs text-[var(--muted)] text-center">
        Scoring: combined score relative to par · Missed cut (MC) scores are not counted
      </p>
    </div>
  );
}