import { createClient } from "@/lib/supabase/server";
import { TOURNAMENT_YEAR } from "@/types";
import MergedClient, { GolferRow } from "./MergedClient";

export const revalidate = 60;

const MASTERS_EVENT_ID = process.env.MASTERS_EVENT_ID;
const ESPN_URL = MASTERS_EVENT_ID
  ? `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${MASTERS_EVENT_ID}`
  : null;

async function getGolfers(): Promise<{ golfers: GolferRow[]; currentRound: number } | null> {
  if (!ESPN_URL) return null;

  try {
    const res = await fetch(ESPN_URL, {
      headers: { "User-Agent": "masters-pool/1.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const competition = data?.events?.[0]?.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const currentRound: number = competition?.status?.period || 1;

    if (competitors.length === 0) return null;

    const golfers: GolferRow[] = competitors.map((comp: Record<string, unknown>) => {
      const athlete = comp.athlete as Record<string, unknown> | undefined;
      const status = comp.status as Record<string, unknown> | undefined;
      const statusType = status?.type as Record<string, unknown> | undefined;

      const name: string = (athlete?.displayName as string) ?? "";
      const country: string = ((athlete?.flag as Record<string, unknown>)?.alt as string) ?? "";
      const teeTime: string | null = (status?.teeTime as string) ?? null;

      const statusName: string = (statusType?.name as string)?.toLowerCase() ?? "";
      const state: string = (statusType?.state as string) ?? "pre";

      const playerStatus: GolferRow["status"] =
        statusName.includes("cut") ? "mc" :
        statusName.includes("wd") || statusName.includes("withdraw") ? "wd" :
        state === "post" ? "finished" :
        state === "in" ? "active" :
        "notstarted";

      const thru: number | null = state === "in" ? ((status?.period as number) ?? null) : null;

      const parScore = (comp.statistics as { name: string; displayValue: string }[])?.find(
        (s) => s.name === "scoreToPar"
      )?.displayValue;
      const parsedScore = parScore ? parseInt(parScore) : NaN;
      const score = parScore === "E" ? 0 : !isNaN(parsedScore) ? parsedScore : null;

      const linescores = (comp.linescores as { value: number }[]) ?? [];
      const roundScoreRaw = linescores[currentRound - 1]?.value;
      const roundScore = roundScoreRaw != null ? roundScoreRaw : null;

      return {
        name, country, status: playerStatus, thru, score, roundScore, teeTime,
        image_url: null, is_liv: false, is_longshot: false, is_past_champ: false, is_young_gun: false, region: "",
      };
    });

    return { golfers, currentRound };
  } catch {
    return null;
  }
}

export default async function MergedPage() {
  const [result, supabase] = await Promise.all([
    getGolfers(),
    createClient(),
  ]);

  // Fetch DB fields and merge by name
  if (result) {
    const { data: dbGolfers } = await supabase
      .from("golfers")
      .select("name, image_url, is_liv, is_longshot, is_past_champ, is_young_gun, region");
    const dbMap = Object.fromEntries(
      (dbGolfers ?? []).map((g: {
        name: string; image_url: string | null;
        is_liv: boolean; is_longshot: boolean; is_past_champ: boolean; is_young_gun: boolean; region: string;
      }) => [g.name, g])
    );
    result.golfers = result.golfers.map((g) => {
      const db = dbMap[g.name];
      return {
        ...g,
        image_url: db?.image_url ?? null,
        is_liv: db?.is_liv ?? false,
        is_longshot: db?.is_longshot ?? false,
        is_past_champ: db?.is_past_champ ?? false,
        is_young_gun: db?.is_young_gun ?? false,
        region: db?.region ?? "",
      };
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        <p className="text-sm text-[var(--muted-light)] mt-1">
          {TOURNAMENT_YEAR} Masters{result ? ` · Round ${result.currentRound}` : ""}
        </p>
      </div>

      {!result ? (
        <div className="glass-card p-12 text-center space-y-3">
          <div className="text-4xl">📅</div>
          <p className="font-medium">Schedule not yet available</p>
          <p className="text-sm text-[var(--muted)]">
            Tee times will appear once the Masters field is set.
          </p>
        </div>
      ) : (
        <MergedClient golfers={result.golfers} currentRound={result.currentRound} />
      )}

      <p className="text-xs text-[var(--muted)] text-center pb-2">
        Updates every 60 seconds · All times Eastern
      </p>
    </div>
  );
}
