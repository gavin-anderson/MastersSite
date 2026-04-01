"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") ?? "/picks";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        setSignedUp(true);
      }
    }
  }

  if (signedUp) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-full max-w-sm space-y-6 animate-fade-in">
          <div className="text-center space-y-2">
            <div className="text-4xl">⛳</div>
            <h1 className="text-2xl font-bold tracking-tight">You&apos;re in!</h1>
          </div>
          <div className="glass-card p-6 text-center space-y-3">
            <div className="text-3xl">🎉</div>
            <p className="font-medium">Account created</p>
            <p className="text-sm text-[var(--muted-light)]">
              Check your email to confirm your account, then come back to make your picks.
            </p>
            <button
              onClick={() => { setSignedUp(false); setMode("signin"); }}
              className="btn-primary w-full justify-center mt-2"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="text-4xl">⛳</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-sm text-[var(--muted-light)]">
            {mode === "signin"
              ? "Sign in to make your Masters picks"
              : "Join the pool and make your picks"}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "signin"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "signup"
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Sign Up
          </button>
        </div>

        <div className="glass-card p-6">
          <form onSubmit={handleSubmit} className="space-y-3">
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
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="field-input"
              />
            </div>

            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-xs text-[var(--muted)] font-medium uppercase tracking-wider">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="field-input"
                />
              </div>
            )}

            {error && <p className="text-xs text-[var(--error)]">{error}</p>}

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

        <p className="text-center text-xs text-[var(--muted)]">
          By signing in you agree to play by the rules.{" "}
          <span className="text-[var(--gold-light)]">Good luck!</span>
        </p>
      </div>
    </div>
  );
}
