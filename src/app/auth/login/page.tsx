"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get("redirectedFrom") ?? "/picks";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.push(redirectedFrom);
      router.refresh();
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="text-4xl">⛳</div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-[var(--muted-light)]">
            Sign in to make your Masters picks
          </p>
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
                autoComplete="current-password"
                className="field-input"
              />
            </div>

            {error && <p className="text-xs text-[var(--error)]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full justify-center mt-1"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>

            <div className="text-center pt-1">
              <Link
                href="/auth/forgot-password"
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Forgot your password?
              </Link>
            </div>
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