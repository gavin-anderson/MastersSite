"use client";

import { useState, useEffect } from "react";

export type SortMode = "total" | "round" | "thru";

export interface GolferRow {
  name: string;
  country: string;
  status: "notstarted" | "active" | "finished" | "mc" | "wd";
  thru: number | null;
  score: number | null;
  roundScore: number | null;
  teeTime: string | null;
}

export type PickedNames = Record<string, { label: string; emoji: string }>;

const PICK_MAP: [string, string, string][] = [
  ["usa_golfer",           "American",      "🇺🇸"],
  ["european_golfer",      "European",      "🇪🇺"],
  ["international_golfer", "International", "🌍"],
  ["longshot_golfer",      "Longshot",      "🎯"],
  ["liv_golfer",           "LIV",           "⚡"],
  ["past_champ_golfer",    "Past Champ",    "🏆"],
  ["young_guns_golfer",    "Young Guns",    "🌟"],
  ["free_golfer",          "Free Pick",     "🎰"],
];

const COUNTRY_FLAG: Record<string, string> = {
  USA: "🇺🇸", "United States": "🇺🇸", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", Ireland: "🇮🇪",
  "Northern Ireland": "🇬🇧", Spain: "🇪🇸", Germany: "🇩🇪", France: "🇫🇷",
  Sweden: "🇸🇪", Denmark: "🇩🇰", Norway: "🇳🇴", Belgium: "🇧🇪",
  Switzerland: "🇨🇭", Italy: "🇮🇹", Japan: "🇯🇵", "South Korea": "🇰🇷",
  Korea: "🇰🇷", China: "🇨🇳", Thailand: "🇹🇭", Taiwan: "🇹🇼",
  India: "🇮🇳", Philippines: "🇵🇭", Australia: "🇦🇺", Canada: "🇨🇦",
  "South Africa": "🇿🇦", Argentina: "🇦🇷", Chile: "🇨🇱", Colombia: "🇨🇴",
  Mexico: "🇲🇽", Venezuela: "🇻🇪", Austria: "🇦🇹", Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿", Zimbabwe: "🇿🇼", Fiji: "🇫🇯", Paraguay: "🇵🇾",
};

function formatTeeTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }) + " ET";
}

function scoreText(score: number | null): string {
  if (score === null || isNaN(score)) return "TBD";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function scoreCls(score: number | null, status: GolferRow["status"]): string {
  if (status === "mc" || status === "wd") return "text-[var(--muted)]";
  if (score === null || isNaN(score)) return "text-[var(--muted)]";
  if (score < 0) return "score-under";
  if (score > 0) return "score-over";
  return "score-even";
}

function thruValue(g: GolferRow): number {
  if (g.status === "finished") return 19;
  if (g.status === "active") return g.thru ?? 0;
  if (g.status === "mc" || g.status === "wd") return -2;
  return -1;
}

function sortGolfers(golfers: GolferRow[], mode: SortMode): GolferRow[] {
  return [...golfers].sort((a, b) => {
    const aOut = a.status === "mc" || a.status === "wd";
    const bOut = b.status === "mc" || b.status === "wd";
    if (aOut && !bOut) return 1;
    if (!aOut && bOut) return -1;
    if (aOut && bOut) return 0;

    if (mode === "total") {
      const aVal = a.score ?? 9999;
      const bVal = b.score ?? 9999;
      return aVal !== bVal ? aVal - bVal : (a.name < b.name ? -1 : 1);
    }
    if (mode === "round") {
      const aVal = a.roundScore ?? 9999;
      const bVal = b.roundScore ?? 9999;
      return aVal !== bVal ? aVal - bVal : (a.name < b.name ? -1 : 1);
    }
    // Tee sort: earliest tee time first, no tee time last
    const aTime = a.teeTime ? new Date(a.teeTime).getTime() : 9999999999999;
    const bTime = b.teeTime ? new Date(b.teeTime).getTime() : 9999999999999;
    return aTime - bTime;
  });
}

function assignRanks(sorted: GolferRow[], mode: SortMode): (number | string)[] {
  const getValue = (g: GolferRow): number | null => {
    if (g.status === "mc" || g.status === "wd") return null;
    if (mode === "total") return g.score;
    if (mode === "round") return g.roundScore;
    return thruValue(g);
  };

  const ranks: (number | string)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    if (g.status === "mc") { ranks.push("MC"); continue; }
    if (g.status === "wd") { ranks.push("WD"); continue; }
    const val = getValue(g);
    if (val === null || val === 9999 || val === -1) { ranks.push("—"); continue; }
    if (i > 0 && getValue(sorted[i - 1]) === val) {
      ranks.push(ranks[i - 1]);
    } else {
      ranks.push(i + 1);
    }
  }
  return ranks;
}

export default function ScheduleClient({
  golfers,
  currentRound,
}: {
  golfers: GolferRow[];
  currentRound: number;
}) {
  const [sort, setSort] = useState<SortMode>("total");
  const [myPicksOnly, setMyPicksOnly] = useState(false);
  const [pickedNames, setPickedNames] = useState<PickedNames>({});

  useEffect(() => {
    fetch("/api/picks")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.picks) return;
        const map: PickedNames = {};
        for (const [golferKey, label, emoji] of PICK_MAP) {
          const name = (data.picks[golferKey] as { name: string } | null)?.name;
          if (name) map[name] = { label, emoji };
        }
        setPickedNames(map);
      })
      .catch(() => {});
  }, []);

  const haspicks = Object.keys(pickedNames).length > 0;
  const sorted = sortGolfers(golfers, sort);
  const displayed = myPicksOnly ? sorted.filter((g) => pickedNames[g.name]) : sorted;
  const ranks = assignRanks(sorted, sort);
  // ranks index corresponds to `sorted`, need index map for `displayed`
  const rankByName = Object.fromEntries(sorted.map((g, i) => [g.name, ranks[i]]));

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Sort tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)] font-medium">Sort by</span>
          <div className="flex gap-1">
            {(["total", "round", "thru"] as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSort(mode)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all capitalize ${
                  sort === mode
                    ? "bg-[var(--gold)] text-black"
                    : "bg-white/[0.06] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/[0.1]"
                }`}
              >
                {mode === "total" ? "Total" : mode === "round" ? "Round" : "Tee"}
              </button>
            ))}
          </div>
        </div>

        {/* My Picks filter — only shown when user has picks */}
        {haspicks && (
          <button
            onClick={() => setMyPicksOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              myPicksOnly
                ? "bg-[var(--gold)] text-black"
                : "bg-white/[0.06] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/[0.1]"
            }`}
          >
            <span>⭐</span>
            My Picks
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[2rem_1fr_4.5rem_3.5rem_3.5rem_4rem] gap-x-2 items-center px-4 py-2 border-b border-[var(--border)] bg-white/[0.03]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] text-center">#</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Player</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider text-center hidden sm:block ${sort === "thru" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}>
            Tee
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider text-center ${sort === "round" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}>
            Rnd
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider text-center ${sort === "total" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}>
            Total
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-right text-[var(--muted)]">
            Thru
          </span>
        </div>

        {displayed.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            No picks to show.
          </div>
        )}

        {/* Golfer rows */}
        {displayed.map((golfer, i) => {
          const flag = COUNTRY_FLAG[golfer.country] ?? "🏳️";
          const isMC = golfer.status === "mc";
          const isWD = golfer.status === "wd";
          const isActive = golfer.status === "active";
          const pick = pickedNames[golfer.name];
          const rank = rankByName[golfer.name];

          const thruLabel =
            isMC ? "MC" :
            isWD ? "WD" :
            golfer.status === "finished" ? "F" :
            isActive && golfer.thru !== null ? `Thru ${golfer.thru}` :
            "—";

          const thruCls = isActive
            ? "text-[var(--gold-light)] font-semibold"
            : "text-[var(--muted)]";

          return (
            <div
              key={golfer.name}
              className={`grid grid-cols-[2rem_1fr_4.5rem_3.5rem_3.5rem_4rem] gap-x-2 items-center px-4 py-2.5 ${
                i < displayed.length - 1 ? "border-b border-[var(--border)]/40" : ""
              } ${isMC || isWD ? "opacity-40" : ""} ${isActive ? "bg-[var(--accent-light)]/5" : ""}`}
            >
              {/* Rank */}
              <span className="text-xs tabular-nums text-[var(--muted)] text-center font-medium">
                {rank}
              </span>

              {/* Flag + Name + Pick badge */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-base leading-none shrink-0">{flag}</span>
                <span className={`text-sm font-medium truncate ${isMC || isWD ? "line-through" : ""}`}>
                  {golfer.name}
                </span>
                {pick && (
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] leading-none">
                    {pick.emoji}<span className="hidden sm:inline"> {pick.label}</span>
                  </span>
                )}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] animate-pulse shrink-0" />
                )}
              </div>

              {/* Tee time */}
              <span className={`text-xs tabular-nums text-center hidden sm:block ${
                sort === "thru" ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}>
                {golfer.teeTime ? formatTeeTime(golfer.teeTime) : "TBD"}
              </span>

              {/* Round score */}
              <span className={`text-sm tabular-nums text-center ${
                isMC || isWD ? "text-[var(--muted)]" :
                sort === "round" ? "font-bold text-[var(--foreground)]" : "text-[var(--muted-light)]"
              }`}>
                {isMC || isWD ? "—" : golfer.roundScore != null ? golfer.roundScore : "TBD"}
              </span>

              {/* Total score */}
              <span className={`text-sm font-bold tabular-nums text-center ${scoreCls(golfer.score, golfer.status)}`}>
                {isMC ? "MC" : isWD ? "WD" : scoreText(golfer.score)}
              </span>

              {/* Thru */}
              <span className={`text-xs tabular-nums text-right ${thruCls}`}>
                {thruLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
