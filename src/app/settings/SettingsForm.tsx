"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const MAX = 30;

export default function SettingsForm({
  email,
  initialName,
  userId,
}: {
  email: string;
  initialName: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [original, setOriginal] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const unchanged = name.trim() === original;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    setSaving(true);
    await supabase.from("profiles").upsert({ id: userId, display_name: trimmed });
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

  return (
    <>
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
            placeholder="How you appear on the leaderboard"
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
    </>
  );
}
