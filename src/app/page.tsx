import Link from "next/link";
import { TOURNAMENT_YEAR } from "@/types";

const CATEGORIES = [
  {
    emoji: "🇺🇸",
    label: "American",
    color: "badge-usa",
    rules: "Pick any golfer born in the United States.",
  },
  {
    emoji: "🇪🇺",
    label: "European",
    color: "badge-european",
    rules: "Pick any golfer from a European nation — UK, Ireland, Spain, Scandinavia, etc.",
  },
  {
    emoji: "🌏",
    label: "Asian",
    color: "badge-asian",
    rules: "Pick any golfer from an Asian country — Japan, South Korea, China, Thailand, etc.",
  },
  {
    emoji: "🎯",
    label: "Longshot",
    color: "badge-longshot",
    rules: "Pick a golfer with pre-tournament odds of 100-1 or greater. High risk, high reward.",
  },
  {
    emoji: "⚡",
    label: "LIV Golfer",
    color: "badge-liv",
    rules: "Pick any active LIV Golf tour member competing at Augusta.",
  },
  {
    emoji: "🦕",
    label: "Fossils",
    color: "badge-senior",
    rules: "Pick a past champion or Augusta veteran aged 50 or over. Respect your elders — or bet on them.",
  },
];

const STEPS = [
  {
    num: "1",
    title: "Sign In",
    body: "Create an account or sign in with Google. Takes 10 seconds.",
  },
  {
    num: "2",
    title: "Set Your Name",
    body: "Choose how you'll appear on the leaderboard — something your friends will recognise.",
  },
  {
    num: "3",
    title: "Make Your Picks",
    body: "Select one golfer from each of the five categories before the tournament begins.",
  },
  {
    num: "4",
    title: "Follow the Action",
    body: "Scores update automatically every 10 minutes throughout the tournament.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-xl mx-auto space-y-10 animate-fade-in pb-4">

      {/* Hero */}
      <div className="text-center space-y-3 pt-4">
        <div className="text-5xl">⛳</div>
        <h1 className="text-3xl font-bold tracking-tight">
          {TOURNAMENT_YEAR} Masters Pool
        </h1>
        <p className="text-sm text-[var(--muted-light)] max-w-xs mx-auto leading-relaxed">
          Pick five golfers across five categories. Lowest combined score wins.
        </p>
        <div className="flex justify-center gap-3 pt-1">
          <Link href="/picks" className="btn-primary">
            Make Your Picks
          </Link>
          <Link href="/golfers" className="btn-outline">
            View Field
          </Link>
        </div>
      </div>

      {/* How to play steps */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">How to Play</h2>
        <div className="space-y-2">
          {STEPS.map((step) => (
            <div key={step.num} className="glass-card-sm px-4 py-3 flex items-start gap-4">
              <div className="w-7 h-7 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-[var(--accent-light)]">{step.num}</span>
              </div>
              <div>
                <p className="font-semibold text-sm">{step.title}</p>
                <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The Five Categories */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">The Five Categories</h2>
        <p className="text-sm text-[var(--muted)]">
          You must pick exactly one golfer from each category. All five picks are required to enter.
        </p>
        <div className="space-y-2">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="glass-card-sm px-4 py-3 flex items-start gap-3">
              <span className="text-2xl shrink-0 leading-tight">{cat.emoji}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">{cat.label}</span>
                  <span className={`badge ${cat.color}`}>{cat.label}</span>
                </div>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{cat.rules}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Scoring */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">Scoring</h2>
        <div className="space-y-2">
          <div className="glass-card-sm px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">📊</span>
            <div>
              <p className="font-semibold text-sm">Combined Score to Par</p>
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">
                Your total is the combined score relative to par for all five of your golfers. Under par is shown in{" "}
                <span className="score-under">green</span>, over par in{" "}
                <span className="score-over">red</span>.{" "}
                <strong className="text-[var(--foreground)]">Lowest score wins.</strong>
              </p>
            </div>
          </div>

          <div className="glass-card-sm px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">✂️</span>
            <div>
              <p className="font-semibold text-sm">Missed Cut Penalty · <span className="score-over">+10</span></p>
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">
                If one of your golfers misses the cut, they add{" "}
                <span className="score-over font-bold">+10</span> strokes to your total. Choose carefully —
                a missed cut can be the difference between first and last place.
              </p>
            </div>
          </div>

          <div className="glass-card-sm px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">🏆</span>
            <div>
              <p className="font-semibold text-sm">Winning</p>
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">
                The participant with the lowest combined score at the end of Sunday&apos;s final round wins the pool.
                In the event of a tie, the prize is shared equally.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Important rules */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold tracking-tight">Important Rules</h2>
        <div className="space-y-2">
          <div className="glass-card-sm px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">🔒</span>
            <div>
              <p className="font-semibold text-sm">Picks Lock at Tee Time</p>
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">
                All picks are locked when the first round begins Thursday morning. You can update your picks
                any time before then — but not after.
              </p>
            </div>
          </div>

          <div className="glass-card-sm px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">👤</span>
            <div>
              <p className="font-semibold text-sm">One Entry Per Person</p>
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">
                Each account gets one set of picks for the tournament year. No duplicate entries.
              </p>
            </div>
          </div>

          <div className="glass-card-sm px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">📡</span>
            <div>
              <p className="font-semibold text-sm">Live Score Updates</p>
              <p className="text-sm text-[var(--muted)] leading-relaxed mt-0.5">
                Scores sync automatically from the ESPN live feed every 10 minutes throughout the tournament.
                No manual updates needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="glass-card p-6 text-center space-y-3">
        <p className="text-2xl">🏌️</p>
        <p className="font-semibold">Ready to play?</p>
        <p className="text-sm text-[var(--muted)]">
          Submit your five picks before the first tee time and may the best team win.
        </p>
        <Link href="/picks" className="btn-gold inline-flex">
          Submit Your Picks
        </Link>
      </div>

      <p className="text-center text-xs text-[var(--muted)] pb-2">
        Brought to you by{" "}
        <a href="https://www.buzzresearch.org/" target="_blank" rel="noopener noreferrer" className="text-[var(--gold-light)] font-semibold hover:underline">
          Buzz Research
        </a>
      </p>

    </div>
  );
}
