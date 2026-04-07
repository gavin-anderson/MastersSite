"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function AuthForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") ?? "/picks";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (mode === "signup" && !displayName.trim()) {
      setError("Please enter a display name.");
      return;
    }

    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        router.push(redirectedFrom);
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setLoading(false);
        setError(error.message);
        return;
      }

      // Save display name to profile
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: displayName.trim(),
        });
      }

      setLoading(false);

      // If email confirmation is required, Supabase returns a user with no session
      if (!data.session) {
        setSuccess("Account created! Check your email to confirm before signing in.");
      } else {
        window.location.href = redirectedFrom;
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={`flex-1 py-2 text-sm font-semibold transition-all ${
            mode === "signin"
              ? "bg-[var(--accent)] text-white"
              : "bg-white/5 text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={`flex-1 py-2 text-sm font-semibold transition-all ${
            mode === "signup"
              ? "bg-[var(--accent)] text-white"
              : "bg-white/5 text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Create Account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <div className="space-y-1">
            <label className="text-xs text-[var(--muted)] font-medium uppercase tracking-wider">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you'll appear on the leaderboard"
              required
              autoComplete="nickname"
              className="field-input"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-[var(--muted)] font-medium uppercase tracking-wider">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoComplete="email"
            className="field-input"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--muted)] font-medium uppercase tracking-wider">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="field-input"
          />
        </div>

        {error && <p className="text-xs text-[var(--error)]">{error}</p>}
        {success && <p className="text-xs text-[var(--success)]">{success}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn-gold w-full justify-center mt-1"
        >
          {loading
            ? mode === "signin" ? "Signing in…" : "Creating account…"
            : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        {mode === "signin" && (
          <div className="text-center pt-1">
            <Link
              href="/auth/forgot-password"
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Forgot your password?
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="text-4xl">⛳</div>
          <h1 className="text-2xl font-bold tracking-tight">Masters Pool</h1>
          <p className="text-sm text-[var(--muted-light)]">
            Sign in or create an account to make your picks
          </p>
        </div>

        <div className="glass-card p-6">
          <Suspense fallback={null}>
            <AuthForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          By signing in you agree to play by the rules.{" "}
          <span className="text-[var(--gold-light)]">Good luck!</span>
        </p>
      </div>
    </div>
  );
}
