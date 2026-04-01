"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface ChatMessage {
  id: string;
  user_id: string;
  display_name: string;
  message: string;
  created_at: string;
}

const MAX_CHARS = 280;

const CHAT_COLORS = [
  "#FF4500", "#1E90FF", "#00CED1", "#9ACD32", "#FF69B4",
  "#DAA520", "#5F9EA0", "#FF6347", "#00FA9A", "#9370DB",
  "#F4A460", "#20B2AA", "#FF8C00", "#7B68EE", "#32CD32",
  "#FF1493", "#00BFFF", "#FFD700", "#8A2BE2", "#40E0D0",
  "#FF7F50", "#ADFF2F", "#BA55D3", "#F08080",
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Chat({ user, fullPage = false }: { user: User; fullPage?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [displayName, setDisplayName] = useState("Anonymous");
  const [hasNew, setHasNew] = useState(false);
  const mobileOpenRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    mobileOpenRef.current = mobileOpen;
    if (mobileOpen) setHasNew(false);
  }, [mobileOpen]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const name =
          data?.display_name ??
          (user.user_metadata?.full_name as string | undefined) ??
          user.email?.split("@")[0] ??
          "Anonymous";
        setDisplayName(name);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => { if (data) setMessages(data); });

    const channel = supabase
      .channel("chat_room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
        if (!mobileOpenRef.current) setHasNew(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || sending || msg.length > MAX_CHARS) return;
    setSending(true);
    setInput("");
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      display_name: displayName,
      message: msg,
    });
    setSending(false);
    inputRef.current?.focus();
  }

  const panel = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
        <span className="text-sm font-semibold tracking-tight">Pool Chat</span>
        <span className="w-2 h-2 rounded-full bg-[var(--accent-light)]" title="Live" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-xs text-[var(--muted)] mt-10 px-4">
            No messages yet — say something! 👋
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.user_id === user.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              <div className={`text-sm leading-snug max-w-[85%] ${isMe ? "text-right" : ""}`}>
                <span
                  className="font-bold mr-1"
                  style={{ color: getUserColor(msg.user_id) }}
                >
                  {msg.display_name}:
                </span>
                <span className="text-[var(--foreground)] break-words">
                  {msg.message}
                </span>
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-0.5">
                {formatTime(msg.created_at)}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[var(--border)] shrink-0">
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            className="field-input text-sm flex-1"
            placeholder="Message the pool…"
            value={input}
            maxLength={MAX_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="shrink-0 w-9 h-9 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center text-white"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12V2M2 7l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {input.length > MAX_CHARS * 0.8 && (
          <p className={`text-[10px] mt-1 text-right ${input.length >= MAX_CHARS ? "text-[var(--error)]" : "text-[var(--muted)]"}`}>
            {input.length}/{MAX_CHARS}
          </p>
        )}
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="glass-card overflow-hidden h-full">
        {panel}
      </div>
    );
  }

  return (
    <>
      {/* Desktop: sticky sidebar */}
      <div className="hidden md:flex flex-col w-80 3xl:w-96 shrink-0 glass-card sticky top-20 overflow-hidden" style={{ height: "calc(100vh - 6rem)" }}>
        {panel}
      </div>

      {/* Mobile: floating button + bottom sheet */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open chat"
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-lg shadow-black/40 flex items-center justify-center transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H6l-4 4V4z" fill="currentColor"/>
          </svg>
          {hasNew && (
            <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-[var(--gold)] border-2 border-[var(--background)]" />
          )}
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <div className="relative glass-card rounded-b-none rounded-t-2xl flex flex-col overflow-hidden" style={{ height: "70vh" }}>
              {panel}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
