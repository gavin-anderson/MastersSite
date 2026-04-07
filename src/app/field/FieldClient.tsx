"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import US from "country-flag-icons/react/3x2/US";
import EU from "country-flag-icons/react/3x2/EU";

const CATEGORIES = [
  { key: "all",           label: "All",      icon: null },
  { key: "usa",           label: "USA",      icon: <US className="w-4 h-auto rounded-[2px]" /> },
  { key: "european",      label: "EUR",      icon: <EU className="w-4 h-auto rounded-[2px]" /> },
  { key: "international", label: "Intl",     icon: <span>🌍</span> },
  { key: "longshot",      label: "Longshot", icon: <span>🎯</span> },
  { key: "liv",           label: "LIV",      icon: <span>⚡</span> },
  { key: "past_champ",    label: "Champs",   icon: <span>🏆</span> },
  { key: "young_gun",     label: "U-30",     icon: <span>🌟</span> },
];

export type SortMode = "total" | "round" | "thru" | "holes";

export interface GolferRow {
  golfer_id: string;
  name: string;
  country: string;
  status: "notstarted" | "active" | "finished" | "mc" | "wd";
  thru: number | null;
  score: number | null;
  roundScore: number | null;
  teeTime: string | null;
  image_url: string | null;
  is_liv: boolean;
  is_longshot: boolean;
  is_past_champ: boolean;
  is_young_gun: boolean;
  region: string;
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
      if (aVal !== bVal) return aVal - bVal;
      const aTime = a.teeTime ? new Date(a.teeTime).getTime() : 9999999999999;
      const bTime = b.teeTime ? new Date(b.teeTime).getTime() : 9999999999999;
      return aTime - bTime;
    }
    if (mode === "round") {
      const aVal = a.roundScore ?? 9999;
      const bVal = b.roundScore ?? 9999;
      return aVal !== bVal ? aVal - bVal : (a.name < b.name ? -1 : 1);
    }
    if (mode === "holes") {
      const aVal = thruValue(a);
      const bVal = thruValue(b);
      return aVal !== bVal ? bVal - aVal : (a.name < b.name ? -1 : 1);
    }
    // Tee sort: earliest tee time first
    const aTime = a.teeTime ? new Date(a.teeTime).getTime() : 9999999999999;
    const bTime = b.teeTime ? new Date(b.teeTime).getTime() : 9999999999999;
    return aTime - bTime;
  });
}

// Position for the # column: primary = total score, secondary = thru (lower = better), true tie = "—"
function computePositions(golfers: GolferRow[]): Record<string, number | string> {
  const result: Record<string, number | string> = {};

  const active = golfers.filter(
    (g) => g.status !== "mc" && g.status !== "wd" && g.score !== null
  );

  const sorted = [...active].sort((a, b) => {
    const scoreDiff = (a.score ?? 9999) - (b.score ?? 9999);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.thru ?? 0) - (b.thru ?? 0);
  });

  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const hasTie = sorted.some(
      (other, j) => j !== i && other.score === g.score && (other.thru ?? 0) === (g.thru ?? 0)
    );
    result[g.name] = hasTie ? "—" : i + 1;
  }

  for (const g of golfers) {
    if (!(g.name in result)) {
      if (g.status === "mc") result[g.name] = "MC";
      else if (g.status === "wd") result[g.name] = "WD";
      else result[g.name] = "—";
    }
  }

  return result;
}

function assignRanks(sorted: GolferRow[], mode: SortMode): (number | string)[] {
  const getValue = (g: GolferRow): number | null => {
    if (g.status === "mc" || g.status === "wd") return null;
    if (mode === "total") return g.score;
    if (mode === "round") return g.roundScore;
    if (mode === "holes") return thruValue(g);
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

function PlayerAvatar({ imageUrl, name, flag }: { imageUrl: string | null; name: string; flag: string }) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return <span className="text-base leading-none shrink-0">{flag}</span>;
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      className="w-7 h-7 rounded-full object-cover object-top shrink-0 bg-white/10"
      onError={() => setFailed(true)}
    />
  );
}

export default function FieldClient({
  golfers: initialGolfers,
  currentRound: initialRound,
  pickers,
}: {
  golfers: GolferRow[];
  currentRound: number;
  pickers: Record<string, string[]>;
}) {
  const [golfers, setGolfers] = useState<GolferRow[]>(initialGolfers);
  const [currentRound, setCurrentRound] = useState(initialRound);
  const [sort, setSort] = useState<SortMode>("total");
  const [myPicksOnly, setMyPicksOnly] = useState(false);
  const [pickedNames, setPickedNames] = useState<PickedNames>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [openGolfer, setOpenGolfer] = useState<string | null>(null);

  // Supabase Realtime — subscribe to golfer_stats changes
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel("golfer_stats_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "golfer_stats" },
        (payload) => {
          const updated = payload.new as {
            golfer_id: string;
            score: number | null;
            round_score: number | null;
            status: string;
            thru: number | null;
            round: number | null;
            tee_time: string | null;
          };

          const rawStatus = updated.status ?? "notstarted";
          const status: GolferRow["status"] =
            rawStatus === "complete" ? "finished" :
            rawStatus === "active" ? "active" :
            rawStatus === "mc" ? "mc" :
            rawStatus === "wd" ? "wd" :
            "notstarted";

          setGolfers((prev) =>
            prev.map((g) =>
              g.golfer_id === updated.golfer_id
                ? { ...g, score: updated.score, roundScore: updated.round_score, status, thru: updated.thru, teeTime: updated.tee_time }
                : g
            )
          );

          if (updated.round) {
            setCurrentRound((prev) => Math.max(prev, updated.round!));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const filtered = useMemo(() => {
    let list = [...golfers];
    if (category === "longshot") list = list.filter((g) => g.is_longshot);
    else if (category === "liv") list = list.filter((g) => g.is_liv);
    else if (category === "past_champ") list = list.filter((g) => g.is_past_champ);
    else if (category === "young_gun") list = list.filter((g) => g.is_young_gun);
    else if (category === "international") list = list.filter((g) => g.region !== "usa" && g.region !== "european");
    else if (category !== "all") list = list.filter((g) => g.region === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }
    return list;
  }, [golfers, category, search]);

  const sorted = sortGolfers(filtered, sort);
  const displayed = myPicksOnly ? sorted.filter((g) => pickedNames[g.name]) : sorted;
  const positions = useMemo(() => computePositions(golfers), [golfers]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]" aria-label="Clear search">
            <svg width="14" height="14" fill="none" viewBox="0 0 14 14">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Category filter pills + My Picks */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory((prev) => prev === cat.key ? "all" : cat.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              category === cat.key
                ? "bg-[var(--accent)] text-white"
                : "bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--foreground)]"
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
        {haspicks && (
          <button
            onClick={() => setMyPicksOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
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

      {/* Results count */}
      <p className="text-xs text-[var(--muted)]">
        {filtered.length} player{filtered.length !== 1 ? "s" : ""}
        {category !== "all" ? ` in ${CATEGORIES.find((c) => c.key === category)?.label ?? category}` : ""}
        {search.trim() ? ` matching "${search.trim()}"` : ""}
      </p>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1.5rem_1fr_3rem_3rem_3rem] sm:grid-cols-[2rem_1fr_4.5rem_3.5rem_3.5rem_4rem] gap-x-2 items-center px-3 sm:px-4 py-2 bg-white/[0.03]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] text-center">#</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Player</span>
          <button
            onClick={() => setSort("thru")}
            className={`text-[10px] font-semibold uppercase tracking-wider text-center hidden sm:block transition-colors hover:text-[var(--gold)] ${sort === "thru" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}
          >
            Tee
          </button>
          <button
            onClick={() => setSort("round")}
            className={`text-[10px] font-semibold uppercase tracking-wider text-center transition-colors hover:text-[var(--gold)] ${sort === "round" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}
          >
            Rnd
          </button>
          <button
            onClick={() => setSort("total")}
            className={`text-[10px] font-semibold uppercase tracking-wider text-center transition-colors hover:text-[var(--gold)] ${sort === "total" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}
          >
            Total
          </button>
          <button
            onClick={() => setSort("holes")}
            className={`text-[10px] font-semibold uppercase tracking-wider text-right transition-colors hover:text-[var(--gold)] ${sort === "holes" ? "text-[var(--gold)]" : "text-[var(--muted)]"}`}
          >
            Thru
          </button>
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
          const rank = positions[golfer.name] ?? "—";
          const rowPickers = pickers[golfer.golfer_id] ?? [];
          const isOpen = openGolfer === golfer.golfer_id;

          const thruLabel =
            isMC ? "MC" :
            isWD ? "WD" :
            golfer.status === "finished" ? "F" :
            isActive && golfer.thru !== null ? golfer.thru.toString() :
            "—";

          const thruCls = isActive
            ? "text-[var(--gold-light)] font-semibold"
            : "text-[var(--muted)]";

          return (
            <div
              key={golfer.name}
              className={i < displayed.length - 1 ? "border-b border-gray-700/50" : ""}
            >
              <button
                onClick={() => setOpenGolfer(isOpen ? null : golfer.golfer_id)}
                className={`w-full grid grid-cols-[1.5rem_1fr_3rem_3rem_3rem] sm:grid-cols-[2rem_1fr_4.5rem_3.5rem_3.5rem_4rem] gap-x-2 items-center px-3 sm:px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03] ${
                  isMC || isWD ? "opacity-40" : ""
                } ${pick ? "bg-[#fbbf24]/[0.08]" : isActive ? "bg-[var(--accent-light)]/5" : ""} ${isOpen ? "bg-white/[0.04]" : ""}`}
              >
                {/* Rank */}
                <span className="text-xs tabular-nums text-[var(--muted)] text-center font-medium">
                  {rank}
                </span>

                {/* Avatar + Name + Pick badge */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <PlayerAvatar imageUrl={golfer.image_url} name={golfer.name} flag={flag} />
                  <span className={`text-sm font-medium truncate ${isMC || isWD ? "line-through" : ""}`}>
                    {golfer.name}
                  </span>
                  <span className="hidden sm:contents">
                    {golfer.region === "usa" && (
                      <span className="badge badge-usa shrink-0">USA</span>
                    )}
                    {golfer.region === "european" && (
                      <span className="badge badge-european shrink-0">EUR</span>
                    )}
                    {golfer.region === "international" && (
                      <span className="badge badge-international shrink-0">Intl</span>
                    )}
                    {golfer.is_liv && (
                      <span className="badge badge-liv shrink-0">LIV</span>
                    )}
                    {golfer.is_longshot && (
                      <span className="badge badge-longshot shrink-0">Long</span>
                    )}
                    {golfer.is_past_champ && (
                      <span className="badge badge-past-champ shrink-0">Champ</span>
                    )}
                    {golfer.is_young_gun && (
                      <span className="badge badge-young-gun shrink-0">U-30</span>
                    )}
                  </span>
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
              </button>

              {/* Pickers dropdown */}
              {isOpen && (
                <div className="px-4 pb-3 pt-2 border-t border-gray-700/50 bg-white/[0.02]">
                  {rowPickers.length === 0 ? (
                    <div className="flex items-center gap-2 text-[var(--muted)]">
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                      </svg>
                      <span className="text-xs">Not picked by anyone</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {rowPickers.map((name) => (
                        <span key={name} className="text-xs bg-white/[0.07] text-[var(--foreground)] px-2 py-0.5 rounded-full">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
