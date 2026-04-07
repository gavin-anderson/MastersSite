import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { TOURNAMENT_YEAR } from "@/types";
import LeaderboardClient, { RankedEntry } from "@/components/LeaderboardClient";

export const revalidate = 30;

const GOLFER_KEYS: Array<[string, string, string]> = [
  ["usa_pick",           "usa_golfer",           "usa"],
  ["european_pick",      "european_golfer",      "european"],
  ["international_pick", "international_golfer", "international"],
  ["longshot_pick",      "longshot_golfer",      "longshot"],
  ["liv_pick",           "liv_golfer",           "liv"],
  ["past_champ_pick",    "past_champ_golfer",    "past_champ"],
  ["young_guns_pick",    "young_guns_golfer",    "young_gun"],
];

export default async function LeaderboardPage() {
  const serverClient = await createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const currentUserId = user?.id ?? null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: picks, error: picksError }, { data: stats }, { data: config }] = await Promise.all([
    supabase
      .from("picks")
      .select(`
        *,
        usa_golfer:golfers!picks_usa_pick_fkey(id, name, country, region),
        european_golfer:golfers!picks_european_pick_fkey(id, name, country, region),
        international_golfer:golfers!picks_asian_pick_fkey(id, name, country, region),
        longshot_golfer:golfers!picks_longshot_pick_fkey(id, name, country, region),
        liv_golfer:golfers!picks_liv_pick_fkey(id, name, country, region),
        past_champ_golfer:golfers!picks_past_champ_pick_fkey(id, name, country, region),
        young_guns_golfer:golfers!picks_young_guns_pick_fkey(id, name, country, region)
      `)
      .eq("year", TOURNAMENT_YEAR),
    supabase
      .from("golfer_stats")
      .select("golfer_id, score, position, status, thru")
      .eq("year", TOURNAMENT_YEAR),
    supabase
      .from("tournament_config")
      .select("picks_locked")
      .eq("year", TOURNAMENT_YEAR)
      .single(),
  ]);

  if (picksError) console.error("[leaderboard] picks query error:", picksError);

  const userIds = (picks ?? []).map((p) => p.user_id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]));

  const statsMap = Object.fromEntries((stats ?? []).map((s) => [s.golfer_id, s]));
  const picksLocked = config?.picks_locked ?? false;

  const ranked: RankedEntry[] = (picks ?? [])
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
        userId: p.user_id,
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
          {TOURNAMENT_YEAR} Masters Tournament · {(picks ?? []).length} participant
          {(picks ?? []).length !== 1 ? "s" : ""}
        </p>
      </div>

      {ranked.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl">🏌️</div>
          <p className="font-medium">No picks submitted yet</p>
          <p className="text-sm text-[var(--muted)]">Be the first to submit your picks!</p>
        </div>
      ) : (
        <LeaderboardClient ranked={ranked} initialStats={statsMap} picksLocked={picksLocked} currentUserId={currentUserId} />
      )}

      <p className="text-xs text-[var(--muted)] text-center">
        Scoring: combined score relative to par
      </p>
    </div>
  );
}
