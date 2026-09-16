"use client";

import { MessageCircle, Send, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ChatScope = "report" | "company";

const SCOPE_COPY: Record<ChatScope, { title: string; placeholder: string; ariaLabel: string }> = {
  report: {
    title: "Ask about this report",
    placeholder: 'Ask anything about this report — e.g. "What changed with pricing?" or "Summarize the highest-priority signal."',
    ariaLabel: "Ask about this report",
  },
  company: {
    title: "Ask about this company",
    placeholder:
      'Ask anything across all tracked competitors — e.g. "Has Drata changed pricing this quarter?" or "Any big news this month?"',
    ariaLabel: "Ask about this company",
  },
};

// Founder Q&A (Phases 1-3 — see docs/decisions.md): one component, `scope` decides which
// backend endpoint /api/chat forwards to. History is persisted server-side (chat_messages) —
// this component just hydrates from it on first open and appends locally as messages stream in.
export function ChatPanel({ scope, id }: { scope: ChatScope; id: string }) {
  const copy = SCOPE_COPY[scope];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    const supabase = createClient();
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("scope", scope)
      .eq("subject_id", id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as ChatMessage[]);
      });
  }, [open, historyLoaded, scope, id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, id, question }),
      });

      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: answer }]);
      }
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      setError(err instanceof Error ? err.message : "Couldn't get an answer — try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={copy.ariaLabel}
        className="fixed right-5 bottom-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_24px_-4px_rgba(60,64,67,0.16)] transition hover:bg-brand-hover"
      >
        <MessageCircle size={20} />
      </button>
    );
  }

  return (
    <div className="fixed right-5 bottom-5 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-lg border border-border bg-canvas shadow-[0_8px_24px_-4px_rgba(60,64,67,0.16)] dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-border-dark">
        <span className="font-heading text-sm font-semibold text-ink dark:text-ink-dark">{copy.title}</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-hover dark:text-ink-muted-dark dark:hover:bg-hover-dark"
        >
          <X size={15} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="text-sm text-ink-muted dark:text-ink-muted-dark">{copy.placeholder}</p>}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-brand text-white"
                : "bg-canvas-dim text-ink dark:bg-hover-dark dark:text-ink-dark"
            }`}
          >
            {m.content || (loading && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && <div className="text-xs text-critical dark:text-critical-dark">{error}</div>}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3 dark:border-border-dark">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="h-9 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-border-dark dark:bg-surface-dark dark:text-ink-dark"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition hover:bg-brand-hover disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
