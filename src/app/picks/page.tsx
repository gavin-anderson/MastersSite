import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { TOURNAMENT_YEAR, PICK_CATEGORIES } from "@/types";
import PicksForm from "@/components/PicksForm";

const getGolfers = unstable_cache(
  async () => {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await service.from("golfers").select("*").order("name", { ascending: true });
    return data ?? [];
  },
  ["picks-golfers"],
  { revalidate: 300 }
);

async function PicksContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirectedFrom=/picks");

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    golfers,
    { data: existingPicks },
    { data: config },
    { data: stats },
  ] = await Promise.all([
    getGolfers(),
    supabase.from("picks").select("*").eq("user_id", user.id).eq("year", TOURNAMENT_YEAR).single(),
    service.from("tournament_config").select("picks_locked").eq("year", TOURNAMENT_YEAR).single(),
    service.from("golfer_stats").select("golfer_id, score, round_score, position, status, thru").eq("year", TOURNAMENT_YEAR),
  ]);

  const picksLocked = config?.picks_locked || existingPicks?.locked || false;
  const hasPicks = !!(existingPicks && PICK_CATEGORIES.every((cat) => existingPicks[cat.key]));

  return (
    <>
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
        golfers={golfers}
        existingPicks={existingPicks}
        userId={user.id}
        year={TOURNAMENT_YEAR}
        locked={picksLocked}
        stats={Object.fromEntries((stats ?? []).map((s) => [s.golfer_id, s]))}
      />
    </>
  );
}

export default function PicksPage() {
  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <Suspense fallback={
        <div className="space-y-4">
          <div className="h-8 w-52 rounded-lg bg-white/[0.06] animate-pulse" />
          <div className="h-4 w-72 rounded bg-white/[0.04] animate-pulse" />
          <div className="glass-card h-48 animate-pulse" />
          <div className="glass-card h-48 animate-pulse" />
        </div>
      }>
        <PicksContent />
      </Suspense>
    </div>
  );
}
