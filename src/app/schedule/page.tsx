import { TOURNAMENT_YEAR } from "@/types";

export const revalidate = 60;

const MASTERS_EVENT_ID = "401703511";
const ESPN_URL = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${MASTERS_EVENT_ID}`;

const COUNTRY_FLAG: Record<string, string> = {
  USA: "🇺🇸", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", Ireland: "🇮🇪",
  "Northern Ireland": "🇬🇧", Spain: "🇪🇸", Germany: "🇩🇪", France: "🇫🇷",
  Sweden: "🇸🇪", Denmark: "🇩🇰", Norway: "🇳🇴", Belgium: "🇧🇪",
  Switzerland: "🇨🇭", Italy: "🇮🇹", Japan: "🇯🇵", "South Korea": "🇰🇷",
  Korea: "🇰🇷", China: "🇨🇳", Thailand: "🇹🇭", Taiwan: "🇹🇼",
  India: "🇮🇳", Philippines: "🇵🇭", Australia: "🇦🇺", Canada: "🇨🇦",
  "South Africa": "🇿🇦", Argentina: "🇦🇷", Chile: "🇨🇱", Colombia: "🇨🇴",
  Mexico: "🇲🇽", Venezuela: "🇻🇪", Austria: "🇦🇹", Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿", Zimbabwe: "🇿🇼", Fiji: "🇫🇯", Paraguay: "🇵🇾",
};

interface ScheduleGolfer {
  name: string;
  country: string;
  status: "notstarted" | "active" | "finished" | "mc" | "wd";
  thru: number | null;
  score: number | null;
}

interface TeeGroup {
  teeTime: string | null;
  golfers: ScheduleGolfer[];
}

function formatTeeTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }) + " ET";
}

function scoreText(score: number | null): string {
  if (score === null) return "-";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function scoreCls(score: number | null, status: ScheduleGolfer["status"]): string {
  if (status === "mc" || status === "wd") return "text-[var(--muted)]";
  if (score === null) return "text-[var(--muted)]";
  if (score < 0) return "score-under";
  if (score > 0) return "score-over";
  return "score-even";
}

async function getSchedule(): Promise<{ groups: TeeGroup[]; currentRound: number } | null> {
  try {
    const res = await fetch(ESPN_URL, {
      headers: { "User-Agent": "masters-pool/1.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const competition = data?.events?.[0]?.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const currentRound: number = competition?.status?.period ?? 1;

    if (competitors.length === 0) return null;

    const groupMap = new Map<string, ScheduleGolfer[]>();

    for (const comp of competitors) {
      const name: string = comp.athlete?.displayName ?? "";
      const country: string = comp.athlete?.flag?.description ?? "";
      const teeTime: string | null = comp.teeTime ?? null;
      const statusName: string = comp.status?.type?.name?.toLowerCase() ?? "";
      const state: string = comp.status?.type?.state ?? "pre";

      const status: ScheduleGolfer["status"] =
        statusName.includes("cut") ? "mc" :
        statusName.includes("wd") || statusName.includes("withdraw") ? "wd" :
        state === "post" ? "finished" :
        state === "in" ? "active" :
        "notstarted";

      const thru: number | null = state === "in" ? (comp.status?.period ?? null) : null;

      const parScore = comp.statistics?.find(
        (s: { name: string }) => s.name === "scoreToPar"
      )?.displayValue;
      const score = parScore === "E" ? 0 : parScore ? parseInt(parScore) : null;

      const key = teeTime ?? "tbd";
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push({ name, country, status, thru, score });
    }

    const groups: TeeGroup[] = Array.from(groupMap.entries())
      .sort(([a], [b]) => {
        if (a === "tbd") return 1;
        if (b === "tbd") return -1;
        return new Date(a).getTime() - new Date(b).getTime();
      })
      .map(([key, golfers]) => ({
        teeTime: key === "tbd" ? null : key,
        golfers,
      }));

    return { groups, currentRound };
  } catch {
    return null;
  }
}

export default async function SchedulePage() {
  const result = await getSchedule();

  return (
    <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
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
        <div className="glass-card overflow-hidden">
          {result.groups.map((group, i) => (
            <div key={i} className={i > 0 ? "border-t border-[var(--border)]" : ""}>

              {/* Tee time row */}
              <div className="flex items-center gap-3 px-4 py-2 bg-white/[0.02]">
                <span className="text-xs font-semibold text-[var(--foreground)] tabular-nums">
                  {group.teeTime ? formatTeeTime(group.teeTime) : "TBD"}
                </span>
                <span className="flex-1 h-px bg-[var(--border)]" />
                {/* Group status summary */}
                {group.golfers.every(g => g.status === "finished") && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">F</span>
                )}
                {group.golfers.some(g => g.status === "active") && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-light)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] animate-pulse" />
                    Live
                  </span>
                )}
              </div>

              {/* Golfer rows */}
              {group.golfers.map((golfer, j) => {
                const flag = COUNTRY_FLAG[golfer.country] ?? "🏳️";
                const isMC = golfer.status === "mc";
                const isWD = golfer.status === "wd";

                return (
                  <div
                    key={j}
                    className={`grid grid-cols-[1.25rem_1fr_3rem_4.5rem] gap-x-3 items-center px-4 py-2.5 ${
                      j < group.golfers.length - 1 ? "border-b border-[var(--border)]/50" : ""
                    } ${isMC || isWD ? "opacity-40" : ""}`}
                  >
                    {/* Flag */}
                    <span className="text-base leading-none">{flag}</span>

                    {/* Name */}
                    <span className={`text-sm font-medium truncate ${isMC || isWD ? "line-through" : ""}`}>
                      {golfer.name}
                    </span>

                    {/* Score */}
                    <span className={`text-sm font-bold tabular-nums text-right ${scoreCls(golfer.score, golfer.status)}`}>
                      {isMC ? "MC" : isWD ? "WD" : scoreText(golfer.score)}
                    </span>

                    {/* Status */}
                    <span className="text-right">
                      {golfer.status === "finished" && (
                        <span className="text-xs text-[var(--muted)] font-semibold">F</span>
                      )}
                      {golfer.status === "active" && golfer.thru !== null && (
                        <span className="text-xs font-semibold text-[var(--gold-light)] tabular-nums">
                          Hole {golfer.thru}
                        </span>
                      )}
                      {golfer.status === "notstarted" && group.teeTime && (
                        <span className="text-[10px] text-[var(--muted)] tabular-nums">
                          {formatTeeTime(group.teeTime)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted)] text-center pb-2">
        Updates every 60 seconds · All times Eastern
      </p>
    </div>
  );
}
