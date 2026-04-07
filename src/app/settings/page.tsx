import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";

async function SettingsContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirectedFrom=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <SettingsForm
      email={user.email ?? ""}
      initialName={profile?.display_name ?? ""}
      userId={user.id}
    />
  );
}

function SettingsSkeleton() {
  return (
    <>
      <div className="glass-card p-6 space-y-4 animate-pulse">
        <div className="h-3 w-28 rounded bg-white/[0.06]" />
        <div className="h-10 rounded-xl bg-white/[0.04]" />
        <div className="h-10 rounded-full bg-white/[0.04]" />
      </div>
      <div className="glass-card p-6 space-y-4 animate-pulse">
        <div className="h-3 w-20 rounded bg-white/[0.06]" />
        <div className="h-4 w-44 rounded bg-white/[0.04]" />
        <div className="h-10 rounded-full bg-white/[0.04]" />
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-md mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--muted-light)] mt-1">Manage your profile and account.</p>
      </div>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
