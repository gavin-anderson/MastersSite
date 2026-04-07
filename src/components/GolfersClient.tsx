"use client";

import { useState, useMemo } from "react";
import US from "country-flag-icons/react/3x2/US";
import EU from "country-flag-icons/react/3x2/EU";

interface GolferRow {
  id: string;
  name: string;
  country: string;
  region: string;
  is_liv: boolean;
  is_longshot: boolean;
  is_senior: boolean;
  odds: number | null;
}

interface StatRow {
  golfer_id: string;
  score: number | null;
  round_score: number | null;
  position: number | null;
  status: string;
  thru: number | null;
  round: number | null;
}

interface Props {
  golfers: GolferRow[];
  stats: StatRow[];
  tournamentStarted: boolean;
  currentRound: number | null;
  rosterIds?: string[];
}

const REGION_EMOJI: Record<string, string> = {
  usa: "🇺🇸",
  european: "🇪🇺",
  asian: "🌏",
  longshot: "🎯",
  liv: "⚡",
};

const REGION_BADGE: Record<string, string> = {
  usa: "badge-usa",
  european: "badge-european",
  asian: "badge-asian",
  longshot: "badge-longshot",
  liv: "badge-liv",
};

const REGION_LABEL: Record<string, string> = {
  usa: "USA",
  european: "EUR",
  asian: "ASIA",
  longshot: "LONG",
  liv: "LIV",
};

const CATEGORIES = [
  { key: "all",      label: "All",      icon: null },
  { key: "usa",      label: "USA",      icon: <US className="w-4 h-auto rounded-[2px]" /> },
  { key: "european", label: "EUR",      icon: <EU className="w-4 h-auto rounded-[2px]" /> },
  { key: "asian",    label: "Asia",     icon: <span>🌏</span> },
  { key: "longshot", label: "Longshot", icon: <span>🎯</span> },
  { key: "liv",      label: "LIV",      icon: <span>⚡</span> },
  { key: "senior",   label: "Fossils",  icon: <span>🦕</span> },
];

function formatOdds(odds: number | null): string {
  if (!odds) return "";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function scoreText(score: number | null): string {
  if (score === null) return "-";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function scoreCls(score: number | null, status?: string): string {
  if (status === "mc" || status === "cut" || status === "wd")
    return "text-[var(--muted)]";
  if (score === null) return "text-[var(--muted)]";
  if (score < 0) return "score-under";
  if (score > 0) return "score-over";
  return "score-even";
}


export default function GolfersClient({ golfers, stats, tournamentStarted, currentRound, rosterIds = [] }: Props) {
  const rosterSet = new Set(rosterIds);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const statsMap = useMemo(
    () => Object.fromEntries(stats.map((s) => [s.golfer_id, s])),
    [stats]
  );

  // Use position sort only once ESPN starts returning positions
  const hasPositions = useMemo(
    () => stats.some((s) => s.position != null),
    [stats]
  );

  const filtered = useMemo(() => {
    let list = [...golfers];

    if (category === "longshot") {
      list = list.filter((g) => g.is_longshot);
    } else if (category === "liv") {
      list = list.filter((g) => g.is_liv);
    } else if (category === "senior") {
      list = list.filter((g) => g.is_senior);
    } else if (category !== "all") {
      list = list.filter((g) => g.region === category);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const sa = statsMap[a.id];
      const sb = statsMap[b.id];

      if (!hasPositions) {
        return (a.odds ?? 999999) - (b.odds ?? 999999);
      }

      // Position sort once ESPN has live data
      const aStarted = sa && sa.status !== "notstarted";
      const bStarted = sb && sb.status !== "notstarted";
      if (!aStarted && bStarted) return 1;
      if (aStarted && !bStarted) return -1;
      if (!aStarted && !bStarted) {
        return (a.odds ?? 999999) - (b.odds ?? 999999);
      }
      const aActive = sa.status === "active";
      const bActive = sb.status === "active";
      if (!aActive && bActive) return 1;
      if (aActive && !bActive) return -1;
      if (sa.position && sb.position) return sa.position - sb.position;
      return (sa.score ?? 0) - (sb.score ?? 0);
    });

    return list;
  }, [golfers, statsMap, category, search, hasPositions]);

  // Cut line only meaningful once we have positions, with no active filter/search
  const showCutLine = hasPositions && !search.trim() && category === "all";
  const cutLineIndex = showCutLine
    ? filtered.findIndex((g) => {
        const s = statsMap[g.id];
        return s?.status === "mc" || s?.status === "cut";
      })
    : -1;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="field-input pl-9 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Clear search"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              category === cat.key
                ? "bg-[var(--accent)] text-white"
                : "bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--foreground)]"
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Column headers (tournament only) */}
      {tournamentStarted && (
        <div className="grid grid-cols-[2rem_1fr_3rem_3.5rem_2.5rem] gap-x-2 px-4 text-[10px] text-[var(--muted)] uppercase tracking-wider">
          <span className="text-center">Pos</span>
          <span>Player</span>
          <span className="text-right">Total</span>
          <span className="text-right">Today</span>
          <span className="text-right">Thru</span>
        </div>
      )}

      {/* Results count when filtering */}
      {(search.trim() || category !== "all") && (
        <p className="text-xs text-[var(--muted)]">
          {filtered.length} player{filtered.length !== 1 ? "s" : ""}
          {category !== "all" ? ` in ${REGION_LABEL[category] ?? category}` : ""}
          {search.trim() ? ` matching "${search.trim()}"` : ""}
        </p>
      )}

      {filtered.length === 0 && (
        <div className="glass-card p-10 text-center space-y-2">
          <p className="text-2xl">🔍</p>
          <p className="text-sm text-[var(--muted)]">No players found</p>
        </div>
      )}

      {/* Player rows */}
      <div className="space-y-1">
        {filtered.map((golfer, i) => {
          const stat = statsMap[golfer.id];
          const isActive = stat?.status === "active";
          const isMC = stat?.status === "mc" || stat?.status === "cut";
          const isWD = stat?.status === "wd";
          const notStarted = !stat || stat.status === "notstarted";
          const showCut = i === cutLineIndex && cutLineIndex > 0;
          const isOnRoster = rosterSet.has(golfer.id);

          return (
            <div key={golfer.id}>
              {showCut && (
                <div className="flex items-center gap-3 py-2 px-1">
                  <div className="flex-1 h-px bg-[var(--error)] opacity-40" />
                  <span className="text-[10px] text-[var(--error)] font-semibold tracking-widest uppercase opacity-70 shrink-0">
                    Cut Line
                  </span>
                  <div className="flex-1 h-px bg-[var(--error)] opacity-40" />
                </div>
              )}

              <div className={`glass-card-sm px-4 py-3 transition-all ${isMC || isWD ? "opacity-50" : ""} ${isOnRoster ? "border-[var(--accent)]/40 bg-[var(--accent)]/5" : ""}`}>
                {tournamentStarted ? (
                  <div className="grid grid-cols-[2rem_1fr_3rem_3.5rem_2.5rem] gap-x-2 items-center">
                    {/* Position */}
                    <div className="flex justify-center">
                      {isMC ? (
                        <span className="text-xs font-bold text-[var(--error)]">MC</span>
                      ) : isWD ? (
                        <span className="text-xs font-bold text-[var(--muted)]">WD</span>
                      ) : stat?.position ? (
                        <span className={`text-sm font-bold tabular-nums ${
                          stat.position === 1
                            ? "text-[var(--gold-light)]"
                            : stat.position <= 5
                            ? "text-[var(--accent-light)]"
                            : "text-[var(--foreground)]"
                        }`}>
                          {stat.position === 1 ? "1" : `T${stat.position}`}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">-</span>
                      )}
                    </div>

                    {/* Name + badges */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-sm truncate leading-tight">{golfer.name}</span>
                        {isOnRoster && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent-light)] bg-[var(--accent)]/20 px-1.5 py-0.5 rounded-full shrink-0">
                            My Pick
                          </span>
                        )}
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] shrink-0 animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {REGION_BADGE[golfer.region] && (
                          <span className={`badge ${REGION_BADGE[golfer.region]}`}>
                            {REGION_LABEL[golfer.region]}
                          </span>
                        )}
                        {golfer.is_liv && (
                          <span className="badge badge-liv">LIV</span>
                        )}
                        {golfer.is_longshot && (
                          <span className="badge badge-longshot">Long</span>
                        )}
                        {golfer.is_senior && (
                          <span className="badge badge-senior">🦕</span>
                        )}
                        {golfer.odds && (
                          <span className="text-[10px] text-[var(--gold-light)] font-medium">
                            {formatOdds(golfer.odds)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Total */}
                    <div className={`text-sm font-bold tabular-nums text-right ${scoreCls(stat?.score ?? null, stat?.status)}`}>
                      {isMC || isWD ? "-" : scoreText(stat?.score ?? null)}
                    </div>

                    {/* Today */}
                    <div className={`text-sm font-bold tabular-nums text-right ${scoreCls(stat?.round_score ?? null)}`}>
                      {isActive || (!notStarted && !isMC && !isWD)
                        ? scoreText(stat?.round_score ?? null)
                        : "-"}
                    </div>

                    {/* Thru */}
                    <div className="text-xs text-[var(--muted)] text-right tabular-nums">
                      {isActive && stat?.thru != null
                        ? stat.thru === 18 ? "F" : `${stat.thru}`
                        : "-"}
                    </div>
                  </div>
                ) : (
                  /* Pre-tournament */
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm truncate">{golfer.name}</span>
                        {isOnRoster && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent-light)] bg-[var(--accent)]/20 px-1.5 py-0.5 rounded-full shrink-0">
                            My Pick
                          </span>
                        )}
                        <span className="text-sm shrink-0">{REGION_EMOJI[golfer.region]}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {REGION_BADGE[golfer.region] && (
                          <span className={`badge ${REGION_BADGE[golfer.region]}`}>
                            {REGION_LABEL[golfer.region]}
                          </span>
                        )}
                        {golfer.is_liv && (
                          <span className="badge badge-liv">LIV</span>
                        )}
                        {golfer.is_longshot && (
                          <span className="badge badge-longshot">Long</span>
                        )}
                        {golfer.is_senior && (
                          <span className="badge badge-senior">🦕</span>
                        )}
                      </div>
                    </div>
                    {golfer.odds && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Odds</p>
                        <p className="text-sm font-bold text-[var(--gold-light)]">{formatOdds(golfer.odds)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {tournamentStarted && (
        <p className="text-xs text-[var(--muted)] text-center pb-2">
          Scores update every 10 minutes · Live{" "}
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] align-middle" />{" "}
          = currently playing
        </p>
      )}
    </div>
  );
}
