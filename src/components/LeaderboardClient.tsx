"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import US from "country-flag-icons/react/3x2/US";
import EU from "country-flag-icons/react/3x2/EU";
import type { ReactNode } from "react";

interface StatRow {
  golfer_id: string;
  score: number | null;
  position: number | null;
  status: string;
  thru: number | null;
}

const CATEGORY_MAP: Record<string, { icon: ReactNode; label: string }> = {
  usa:           { icon: <US className="w-4 h-auto rounded-[2px]" />, label: "American" },
  european:      { icon: <EU className="w-4 h-auto rounded-[2px]" />, label: "European" },
  international: { icon: "🌍", label: "International" },
  longshot:      { icon: "🎯", label: "Longshot" },
  liv:           { icon: "⚡", label: "LIV" },
  past_champ:    { icon: "🏆", label: "Past Champ" },
  young_gun:     { icon: "🌟", label: "Young Guns" },
  free:          { icon: "🎰", label: "Free Pick" },
};

function getScoreDisplay(score: number | null, status?: string) {
  if (status === "mc" || status === "cut")
    return { text: "MC", cls: "text-[var(--muted)]" };
  if (score === null) return { text: "-", cls: "text-[var(--muted)]" };
  if (score < 0) return { text: `${score}`, cls: "score-under" };
  if (score > 0) return { text: `+${score}`, cls: "score-over" };
  return { text: "E", cls: "score-even" };
}

interface GolferScore {
  golfer: { id: string; name: string } | null;
  score: number | null;
  stat: { position?: number | null; status?: string; thru?: number | null } | null;
  categoryKey: string;
}

export interface RankedEntry {
  id: string;
  displayName: string;
  totalScore: number;
  allNoScore: boolean;
  golferScores: GolferScore[];
}

function LeaderboardRow({ entry, rank }: { entry: RankedEntry; rank: number }) {
  const [open, setOpen] = useState(false);

  const rankCls =
    rank === 1 ? "rank-badge rank-1" :
    rank === 2 ? "rank-badge rank-2" :
    rank === 3 ? "rank-badge rank-3" :
    "rank-badge bg-white/5 text-[var(--muted)]";

  const totalDisplay = getScoreDisplay(entry.totalScore);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={rankCls}>{rank}</div>
        <p className="font-semibold flex-1 min-w-0 truncate">{entry.displayName}</p>
        <div className={`text-lg font-bold tabular-nums shrink-0 ${entry.allNoScore ? "text-[var(--muted)]" : totalDisplay.cls}`}>
          {entry.allNoScore ? "0" : totalDisplay.text}
        </div>
        <svg
          className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-3 pt-2 space-y-1">
          {entry.golferScores.map(({ golfer, score, stat, categoryKey }, j) => {
            const cat = CATEGORY_MAP[categoryKey] ?? { emoji: "🏌️", label: categoryKey };
            const scoreDisplay = getScoreDisplay(score, stat?.status);
            const position = stat?.position;

            return (
              <div key={j} className="flex items-center gap-2 py-0.5">
                <span className="w-5 shrink-0 flex items-center justify-center">{cat.icon}</span>
                <span className="text-sm flex-1 min-w-0 truncate text-[var(--foreground)]">
                  {golfer?.name ?? <span className="text-[var(--muted)] italic">No pick</span>}
                </span>
                {position && (
                  <span className="text-xs text-[var(--muted)] shrink-0">T{position}</span>
                )}
                <span className={`text-sm font-bold tabular-nums shrink-0 w-12 text-right ${golfer ? scoreDisplay.cls : "text-[var(--muted)]"}`}>
                  {golfer ? scoreDisplay.text : "–"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LeaderboardClient({
  ranked: initialRanked,
  initialStats,
}: {
  ranked: RankedEntry[];
  initialStats: Record<string, StatRow>;
}) {
  const [statsMap, setStatsMap] = useState<Record<string, StatRow>>(initialStats);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel("leaderboard_golfer_stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "golfer_stats" },
        (payload) => {
          const updated = payload.new as StatRow;
          if (updated?.golfer_id) {
            setStatsMap((prev) => ({ ...prev, [updated.golfer_id]: updated }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const ranked = useMemo(() => {
    return initialRanked
      .map((entry) => {
        const golferScores = entry.golferScores.map((gs) => {
          const stat = gs.golfer?.id ? (statsMap[gs.golfer.id] ?? null) : null;
          const isCut = stat?.status === "mc" || stat?.status === "cut";
          const score = stat ? (isCut ? null : stat.score) : gs.score;
          return { ...gs, score, stat: stat ?? gs.stat };
        });
        const totalScore = golferScores.reduce((sum, { score }) => sum + (score ?? 0), 0);
        const allNoScore = golferScores.every(({ score }) => score === null);
        return { ...entry, golferScores, totalScore, allNoScore };
      })
      .sort((a, b) => a.totalScore - b.totalScore);
  }, [initialRanked, statsMap]);

  return (
    <div className="space-y-2">
      {ranked.map((entry, i) => (
        <LeaderboardRow key={entry.id} entry={entry} rank={i + 1} />
      ))}
    </div>
  );
}
