"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Golfer, Picks, PICK_CATEGORIES } from "@/types";

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
  asian: "Asia",
  longshot: "Longshot",
  liv: "LIV",
  senior: "Fossil",
  other: "Intl",
};

const REGION_BADGE: Record<string, string> = {
  usa: "badge-usa",
  european: "badge-european",
  asian: "badge-asian",
  longshot: "badge-longshot",
  liv: "badge-liv",
  senior: "badge-senior",
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
  const router = useRouter();
  const supabase = createClient();

  const hasPicks = !!(
    existingPicks?.usa_pick &&
    existingPicks?.european_pick &&
    existingPicks?.asian_pick &&
    existingPicks?.longshot_pick &&
    existingPicks?.liv_pick &&
    existingPicks?.senior_pick
  );

  const [mode, setMode] = useState<"roster" | "editing">(
    hasPicks ? "roster" : "editing"
  );

  const [picks, setPicks] = useState<Record<string, string>>({
    usa_pick: existingPicks?.usa_pick ?? "",
    european_pick: existingPicks?.european_pick ?? "",
    asian_pick: existingPicks?.asian_pick ?? "",
    longshot_pick: existingPicks?.longshot_pick ?? "",
    liv_pick: existingPicks?.liv_pick ?? "",
    senior_pick: existingPicks?.senior_pick ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter golfers per category using flag-based approach
  const golfersByCategory = PICK_CATEGORIES.reduce<Record<string, Golfer[]>>((acc, cat) => {
    if (cat.region === "longshot") {
      acc[cat.region] = golfers.filter((g) => g.is_longshot);
    } else if (cat.region === "liv") {
      acc[cat.region] = golfers.filter((g) => g.is_liv);
    } else if (cat.region === "senior") {
      acc[cat.region] = golfers.filter((g) => g.is_senior);
    } else {
      acc[cat.region] = golfers.filter((g) => g.region === cat.region);
    }
    return acc;
  }, {});

  const golferMap = Object.fromEntries(golfers.map((g) => [g.id, g]));
  const allSelected = PICK_CATEGORIES.every((c) => picks[c.key]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allSelected) return;

    setSaving(true);
    setError(null);

    const { error: picksError } = await supabase.from("picks").upsert(
      {
        user_id: userId,
        year,
        usa_pick: picks.usa_pick || null,
        european_pick: picks.european_pick || null,
        asian_pick: picks.asian_pick || null,
        longshot_pick: picks.longshot_pick || null,
        liv_pick: picks.liv_pick || null,
        senior_pick: picks.senior_pick || null,
      },
      { onConflict: "user_id,year" }
    );

    setSaving(false);

    if (picksError) {
      setError(picksError.message);
    } else {
      router.refresh();
      setMode("roster");
    }
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
          {!locked ? (
            <button
              onClick={() => setMode("editing")}
              className="btn-outline flex items-center gap-2 text-sm py-2 px-4"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
              </svg>
              Edit
            </button>
          ) : (
            <span className="text-xs text-[var(--gold-light)] font-medium">🔒 Locked</span>
          )}
        </div>

        <div className="space-y-2">
          {PICK_CATEGORIES.map((cat) => {
            const golferId = picks[cat.key];
            const golfer = golferId ? golferMap[golferId] : null;
            const stat = golferId ? stats[golferId] : undefined;

            return (
              <div key={cat.key} className="glass-card-sm px-4 py-3 flex items-center gap-3">
                <span className="text-xl shrink-0">{cat.emoji}</span>
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {PICK_CATEGORIES.map((cat) => {
        const options = golfersByCategory[cat.region] ?? [];
        const selected = picks[cat.key];
        const selectedGolfer = golfers.find((g) => g.id === selected);

        return (
          <div key={cat.key} className="glass-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white/5 text-base">
                {cat.emoji}
              </span>
              <div>
                <h3 className="font-semibold text-sm">{cat.label}</h3>
                <p className="text-xs text-[var(--muted)]">{cat.description}</p>
              </div>
              {selectedGolfer && (
                <div className="ml-auto text-right">
                  <p className="text-sm font-medium text-[var(--accent-light)]">
                    {selectedGolfer.name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {selectedGolfer.country}
                    {selectedGolfer.odds ? ` · ${formatOdds(selectedGolfer.odds)}` : ""}
                  </p>
                </div>
              )}
            </div>

            {options.length === 0 ? (
              <p className="text-xs text-[var(--muted)] italic">
                No golfers available in this category yet.
              </p>
            ) : (
              <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
                {options.map((golfer) => {
                  const isSelected = picks[cat.key] === golfer.id;
                  return (
                    <label
                      key={golfer.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "border-[var(--accent)] bg-[rgba(22,163,74,0.1)]"
                          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-white/[0.03]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={cat.key}
                        value={golfer.id}
                        checked={isSelected}
                        onChange={() =>
                          setPicks((prev) => ({ ...prev, [cat.key]: golfer.id }))
                        }
                        className="sr-only"
                      />
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
                        <p className="font-medium text-sm">{golfer.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-[var(--muted)]">{golfer.country}</span>
                          {golfer.is_liv && cat.region !== "liv" && (
                            <span className="badge badge-liv">LIV</span>
                          )}
                          {golfer.is_longshot && cat.region !== "longshot" && (
                            <span className="badge badge-longshot">Longshot</span>
                          )}
                          {golfer.is_senior && cat.region !== "senior" && (
                            <span className="badge badge-senior">🦕 Fossil</span>
                          )}
                          {golfer.world_ranking && (
                            <span className="text-xs text-[var(--muted)]">#{golfer.world_ranking}</span>
                          )}
                        </div>
                      </div>
                      {golfer.odds && (
                        <span className="text-xs text-[var(--gold-light)] font-semibold shrink-0">
                          {formatOdds(golfer.odds)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={saving || !allSelected} className="btn-gold">
          {saving ? "Saving…" : "Save Picks"}
        </button>
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
