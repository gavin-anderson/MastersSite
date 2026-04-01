"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔑</div>
          <h1 className="text-2xl font-bold tracking-tight">Forgot password?</h1>
          <p className="text-sm text-[var(--muted-light)]">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        <div className="glass-card p-6">
          {sent ? (
            <div className="text-center space-y-3 py-2">
              <div className="text-3xl">📬</div>
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-[var(--muted-light)]">
                If <strong>{email}</strong> has an account, a reset link is on its way.
              </p>
            </div>
          ) : (
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
              {error && <p className="text-xs text-[var(--error)]">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>

        <div className="text-center">
          <Link href="/auth/login" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
