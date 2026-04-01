"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX = 30;

export default function SetNamePage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // If user already has a display name, skip this page
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (profile?.display_name) {
        router.replace("/picks");
      } else {
        setChecking(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/auth/login"); return; }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: trimmed });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
    } else {
      router.replace("/picks");
    }
  }

  if (checking) return null;

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="text-4xl">👋</div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to the pool!</h1>
          <p className="text-sm text-[var(--muted-light)]">
            Pick a name — this is how you&apos;ll appear on the leaderboard and in chat.
          </p>
        </div>

        <div className="glass-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={MAX}
                autoFocus
                className="field-input text-base"
              />
              {name.length >= MAX * 0.8 && (
                <p className={`text-[11px] text-right ${name.length >= MAX ? "text-[var(--error)]" : "text-[var(--muted)]"}`}>
                  {name.length}/{MAX}
                </p>
              )}
            </div>

            {error && <p className="text-xs text-[var(--error)]">{error}</p>}

            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="btn-gold w-full justify-center"
            >
              {saving ? "Saving…" : "Let's go!"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
