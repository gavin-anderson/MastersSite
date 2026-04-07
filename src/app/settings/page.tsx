"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX = 30;

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [original, setOriginal] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/auth/login"); return; }
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      const n = profile?.display_name ?? "";
      setName(n);
      setOriginal(n);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").upsert({ id: user.id, display_name: trimmed });
    setOriginal(trimmed);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) return null;

  const unchanged = name.trim() === original;

  return (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--muted-light)] mt-1">Manage your profile and account.</p>
      </div>

      {/* Display name */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
          Display Name
        </h2>
        <form onSubmit={handleSave} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How you appear on the leaderboard and in chat"
            maxLength={MAX}
            className="field-input"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--muted)]">{name.length}/{MAX}</span>
            {saved && <span className="text-[11px] text-[var(--success)] font-medium">✓ Saved</span>}
          </div>
          <button
            type="submit"
            disabled={saving || unchanged}
            className="btn-primary w-full justify-center"
          >
            {saving ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>

      {/* Account */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
          Account
        </h2>
        {email && (
          <p className="text-sm text-[var(--muted-light)] truncate">{email}</p>
        )}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full py-2.5 px-4 rounded-full text-sm font-medium border border-[var(--error)]/30 text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
