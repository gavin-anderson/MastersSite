import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TOURNAMENT_YEAR, PICK_CATEGORIES } from "@/types";
import PicksForm from "@/components/PicksForm";

export default async function PicksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirectedFrom=/picks");
  }

  const [
    { data: golfers },
    { data: existingPicks },
    { data: config },
    { data: stats },
  ] = await Promise.all([
    supabase.from("golfers").select("*").order("name", { ascending: true }),
    supabase.from("picks").select("*").eq("user_id", user.id).eq("year", TOURNAMENT_YEAR).single(),
    supabase.from("tournament_config").select("picks_locked").eq("year", TOURNAMENT_YEAR).single(),
    supabase.from("golfer_stats").select("golfer_id, score, round_score, position, status, thru").eq("year", TOURNAMENT_YEAR),
  ]);

  const picksLocked = config?.picks_locked || existingPicks?.locked || false;
  const hasPicks = !!(existingPicks && PICK_CATEGORIES.every((cat) => existingPicks[cat.key]));

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      {!hasPicks && (
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {TOURNAMENT_YEAR} Masters Picks
          </h1>
          <p className="text-sm text-[var(--muted-light)]">
            Select one golfer from each category. Picks lock when the tournament begins.
          </p>
        </div>
      )}

      <PicksForm
        golfers={golfers ?? []}
        existingPicks={existingPicks}
        userId={user.id}
        year={TOURNAMENT_YEAR}
        locked={picksLocked}
        stats={Object.fromEntries((stats ?? []).map((s) => [s.golfer_id, s]))}
      />
    </div>
  );
}