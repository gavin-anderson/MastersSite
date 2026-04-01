import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Chat from "@/components/Chat";

export default async function ChatPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <div className="max-w-xl mx-auto flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      <div className="shrink-0 mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Talk Yo Shit 💬</h1>
        <p className="text-sm text-[var(--muted-light)] mt-1">
          Pool chat · Say what&apos;s on your mind
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <Chat user={user} fullPage />
      </div>
    </div>
  );
}
