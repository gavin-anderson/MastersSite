"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { createBrowserClient } from "@supabase/ssr";
import { Golfer, Picks, PICK_CATEGORIES } from "@/types";
import US from "country-flag-icons/react/3x2/US";
import EU from "country-flag-icons/react/3x2/EU";
import type { ReactNode } from "react";

const CATEGORY_ICON: Record<string, ReactNode> = {
  usa:      <US className="w-5 h-auto rounded-[2px]" />,
  european: <EU className="w-5 h-auto rounded-[2px]" />,
};

interface StatRow {
  golfer_id: string;
  score: number | null;
  round_score: number | null;
  position: number | null;
  status: string;
  thru: number | null;
}

interface PicksFormProps {
  golfers: Golfer[];
  existingPicks: Picks | null;
  userId: string;
  year: number;
  locked?: boolean;
  stats?: Record<string, StatRow>;
}

const REGION_LABEL: Record<string, string> = {
  usa: "USA",
  european: "Europe",
  international: "Intl",
  longshot: "Longshot",
  liv: "LIV",
  past_champ: "Champ",
  young_gun: "U-30",
};

const REGION_BADGE: Record<string, string> = {
  usa: "badge-usa",
  european: "badge-european",
  international: "badge-international",
  longshot: "badge-longshot",
  liv: "badge-liv",
  past_champ: "badge-past-champ",
  young_gun: "badge-young-gun",
};

function formatOdds(odds: number | null): string {
  if (!odds) return "";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function scoreText(score: number | null): string {
  if (score === null) return "-";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function scoreCls(score: number | null): string {
  if (score === null) return "text-[var(--muted)]";
  if (score < 0) return "score-under";
  if (score > 0) return "score-over";
  return "score-even";
}

function RosterStat({ stat, odds }: { stat?: StatRow; odds: number | null }) {
  if (!stat || stat.status === "notstarted") {
    return odds ? (
      <div className="text-right shrink-0">
        <p className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Odds</p>
        <p className="text-sm font-bold text-[var(--gold-light)]">{formatOdds(odds)}</p>
      </div>
    ) : null;
  }

  if (stat.status === "mc" || stat.status === "cut") {
    return (
      <div className="text-right shrink-0">
        <p className="text-xs font-bold score-over">MC</p>
        <p className="text-[10px] text-[var(--muted)]">not counted</p>
      </div>
    );
  }

  if (stat.status === "wd") {
    return (
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-[var(--muted)]">WD</p>
      </div>
    );
  }

  const isActive = stat.status === "active";
  const thruText = stat.thru != null
    ? stat.thru === 18 ? "F" : `Thru ${stat.thru}`
    : null;

  return (
    <div className="text-right shrink-0 space-y-0.5">
      <div className="flex items-center justify-end gap-2">
        <span className={`text-sm font-bold tabular-nums ${scoreCls(stat.score)}`}>
          {scoreText(stat.score)}
        </span>
        {stat.position && (
          <span className="text-xs text-[var(--muted)]">T{stat.position}</span>
        )}
      </div>
      {isActive && thruText && (
        <p className="text-[10px] text-[var(--muted)] flex items-center justify-end gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-light)] animate-pulse inline-block" />
          {thruText} · Today {scoreText(stat.round_score)}
        </p>
      )}
    </div>
  );
}

export default function PicksForm({
  golfers,
  existingPicks,
  userId,
  year,
  locked = false,
  stats = {},
}: PicksFormProps) {
  const supabase = createClient();

  const [savedOnce, setSavedOnce] = useState(false);
  const hasPicks = savedOnce || PICK_CATEGORIES.every((cat) => !!(existingPicks?.[cat.key]));

  const [mode, setMode] = useState<"roster" | "editing">(
    hasPicks || locked ? "roster" : "editing"
  );

  const [picks, setPicks] = useState<Record<string, string>>(
    Object.fromEntries(
      PICK_CATEGORIES.map((cat) => [cat.key, existingPicks?.[cat.key] ?? ""])
    )
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(PICK_CATEGORIES.map((cat) => cat.key))
  );

  function toggleCategory(key: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const [liveStats, setLiveStats] = useState<Record<string, StatRow>>(stats);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel("picks_golfer_stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "golfer_stats" },
        (payload) => {
          const updated = payload.new as StatRow;
          if (updated?.golfer_id) {
            setLiveStats((prev) => ({ ...prev, [updated.golfer_id]: updated }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Set of golfer IDs already picked in any category
  const pickedIds = useMemo(
    () => new Set(Object.values(picks).filter(Boolean)),
    [picks]
  );

  function byOdds(a: Golfer, b: Golfer) {
    if (a.odds == null && b.odds == null) return 0;
    if (a.odds == null) return 1;
    if (b.odds == null) return -1;
    return a.odds - b.odds;
  }

  // Filter and sort golfers per category by odds (favorites first)
  const golfersByCategory = useMemo(() =>
    PICK_CATEGORIES.reduce<Record<string, Golfer[]>>((acc, cat) => {
      let filtered: Golfer[];
      if (cat.region === "longshot") {
        filtered = golfers.filter((g) => g.is_longshot);
      } else if (cat.region === "liv") {
        filtered = golfers.filter((g) => g.is_liv);
      } else if (cat.region === "past_champ") {
        filtered = golfers.filter((g) => g.is_past_champ);
      } else if (cat.region === "young_gun") {
        filtered = golfers.filter((g) => g.is_young_gun);
      } else if (cat.region === "international") {
        filtered = golfers.filter((g) => g.region !== "usa" && g.region !== "european");
      } else {
        filtered = golfers.filter((g) => g.region === cat.region);
      }
      acc[cat.key] = filtered.sort(byOdds);
      return acc;
    }, {}),
    [golfers]
  );

  const golferMap = useMemo(
    () => Object.fromEntries(golfers.map((g) => [g.id, g])),
    [golfers]
  );

  const allSelected = PICK_CATEGORIES.every((c) => picks[c.key]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || !allSelected) return;

    setSaving(true);
    setError(null);

    const { error: picksError } = await supabase.from("picks").upsert(
      {
        user_id: userId,
        year,
        ...Object.fromEntries(
          PICK_CATEGORIES.map((cat) => [cat.key, picks[cat.key] || null])
        ),
      },
      { onConflict: "user_id,year" }
    );

    setSaving(false);

    if (picksError) {
      setError(picksError.message);
    } else {
      setSavedOnce(true);
      setMode("roster");
    }
  }

  // ── Locked with no picks ─────────────────────────────────────
  if (locked && !hasPicks) {
    return (
      <div className="glass-card p-10 text-center space-y-3">
        <div className="text-3xl">🔒</div>
        <p className="font-semibold">Picks are closed</p>
        <p className="text-sm text-[var(--muted)]">
          The tournament has started and picks are now locked.
        </p>
      </div>
    );
  }

  // ── Roster view ──────────────────────────────────────────────
  if (mode === "roster") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Your Roster</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              {locked
                ? "Picks are locked — good luck!"
                : "Picks lock when the tournament begins"}
            </p>
          </div>
          {!locked && (
            <button
              onClick={() => {
                setOpenCategories(new Set(PICK_CATEGORIES.map((cat) => cat.key)));
                setMode("editing");
              }}
              className="btn-outline flex items-center gap-2 text-sm py-2 px-4"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
              </svg>
              Edit
            </button>
          )}
        </div>

        <div className="space-y-2">
          {PICK_CATEGORIES.map((cat) => {
            const golferId = picks[cat.key];
            const golfer = golferId ? golferMap[golferId] : null;
            const stat = golferId ? liveStats[golferId] : undefined;

            return (
              <div key={cat.key} className="glass-card-sm px-4 py-3 flex items-center gap-3">
                <span className="shrink-0 flex items-center justify-center w-6">
                  {CATEGORY_ICON[cat.region] ?? <span className="text-xl">{cat.emoji}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">
                    {cat.label}
                  </p>
                  <p className="font-semibold text-sm truncate mt-0.5">
                    {golfer?.name ?? <span className="text-[var(--muted)] italic">No pick</span>}
                  </p>
                </div>
                {golfer && (
                  <RosterStat stat={stat} odds={golfer.odds} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Selection form ──────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {PICK_CATEGORIES.map((cat) => {
        const options = golfersByCategory[cat.key] ?? [];
        const selected = picks[cat.key];
        const selectedGolfer = golfers.find((g) => g.id === selected);
        const isOpen = openCategories.has(cat.key);

        return (
          <div key={cat.key} className="glass-card overflow-hidden">
            {/* Accordion header — always visible */}
            <button
              type="button"
              onClick={() => toggleCategory(cat.key)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white/5">
                {CATEGORY_ICON[cat.region] ?? <span className="text-base">{cat.emoji}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{cat.label}</p>
                <p className="text-xs truncate mt-0.5">
                  {selectedGolfer
                    ? <span className="text-[var(--accent-light)]">{selectedGolfer.name}{selectedGolfer.odds ? ` · ${formatOdds(selectedGolfer.odds)}` : ""}</span>
                    : <span className="text-[var(--muted)]">{cat.description}</span>
                  }
                </p>
              </div>
              {selectedGolfer && !isOpen && (
                <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
              )}
              <svg
                className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expandable golfer list */}
            {isOpen && (
              <div className="border-t border-[var(--border)] px-4 pb-3 pt-2">
                {options.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] italic py-2">
                    No golfers available in this category yet.
                  </p>
                ) : (
                  <div className="grid gap-1.5 max-h-56 overflow-y-auto pr-1 pt-1">
                    {options.map((golfer) => {
                      const isSelected = picks[cat.key] === golfer.id;
                      const takenElsewhere = !isSelected && pickedIds.has(golfer.id);

                      return (
                        <button
                          key={golfer.id}
                          type="button"
                          disabled={takenElsewhere}
                          onClick={() => {
                            if (takenElsewhere) return;
                            setPicks((prev) => ({
                              ...prev,
                              [cat.key]: isSelected ? "" : golfer.id,
                            }));
                          }}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                            takenElsewhere
                              ? "opacity-30 cursor-not-allowed border-[var(--border)]"
                              : isSelected
                              ? "border-[var(--accent)] bg-[rgba(22,163,74,0.1)] cursor-pointer"
                              : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-white/[0.03] cursor-pointer"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? "border-[var(--accent)] bg-[var(--accent)]"
                                : "border-[var(--border-strong)]"
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm">{golfer.name}</p>
                              {takenElsewhere && (
                                <span className="text-[10px] text-[var(--muted)] italic">already picked</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-xs text-[var(--muted)]">{golfer.country}</span>
                              {REGION_BADGE[golfer.region] && cat.region !== golfer.region && (
                                <span className={`badge ${REGION_BADGE[golfer.region]}`}>
                                  {REGION_LABEL[golfer.region]}
                                </span>
                              )}
                              {golfer.is_liv && cat.region !== "liv" && (
                                <span className="badge badge-liv">LIV</span>
                              )}
                              {golfer.is_longshot && cat.region !== "longshot" && (
                                <span className="badge badge-longshot">Longshot</span>
                              )}
                              {golfer.is_past_champ && cat.region !== "past_champ" && (
                                <span className="badge badge-past-champ">Champ</span>
                              )}
                              {golfer.is_young_gun && cat.region !== "young_gun" && (
                                <span className="badge badge-young-gun">U-30</span>
                              )}
                            </div>
                          </div>
                          {golfer.odds && (
                            <span className="text-xs text-[var(--gold-light)] font-semibold shrink-0">
                              {formatOdds(golfer.odds)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3 flex-wrap">
        {!locked && (
          <button type="submit" disabled={saving || !allSelected} className="btn-gold">
            {saving ? "Saving…" : "Save Picks"}
          </button>
        )}
        {hasPicks && (
          <button type="button" onClick={() => setMode("roster")} className="btn-outline">
            Cancel
          </button>
        )}
        {!allSelected && (
          <p className="text-xs text-[var(--muted)]">
            Select one golfer in each category to save.
          </p>
        )}
        {error && <p className="text-xs text-[var(--error)]">{error}</p>}
      </div>
    </form>
  );
}
