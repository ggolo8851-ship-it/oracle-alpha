import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import { saveMessages } from "@/lib/threads";

// UIMessage shape kept compatible with the existing thread store.
type UIPart = { type: "text"; text: string };
type UIMessage = { id: string; role: "user" | "assistant" | "system"; parts: UIPart[] };

const AGENTS = [
  { k: "QUANT", c: "oklch(0.78 0.18 70)" },
  { k: "SENTIMENT", c: "oklch(0.65 0.18 235)" },
  { k: "MACRO", c: "oklch(0.78 0.2 145)" },
  { k: "BEHAVIOR", c: "oklch(0.7 0.22 320)" },
  { k: "RISK", c: "oklch(0.66 0.24 22)" },
  { k: "OPPORTUNITY", c: "oklch(0.82 0.18 85)" },
];

const PROMPTS = [
  "Market pulse — regime, fear/greed, dominant narrative.",
  "$NVDA deep — quant + behavioral + Oracle100 synthesis.",
  "Top finds right now and explain the leader.",
  "Next big movers — microcap anomaly scanner.",
  "Private equity hub — alt managers + BDCs.",
];

export type OracleHandle = { ask: (prompt: string) => void };

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export const OracleConsole = forwardRef<OracleHandle, {
  threadId: string;
  initialMessages: UIMessage[];
}>(function OracleConsole({ threadId, initialMessages }, ref) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // hot-swap when the active thread changes
  useEffect(() => { setMessages(initialMessages); setError(null); }, [threadId]);

  // persist
  useEffect(() => { if (threadId) saveMessages(threadId, messages); }, [messages, threadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => { inputRef.current?.focus(); }, [threadId, busy]);

  const submit = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    const userMsg: UIMessage = { id: uid(), role: "user", parts: [{ type: "text", text: t }] };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string; ui_action?: any };
      if (data.ui_action?.ui_action) {
        window.dispatchEvent(new CustomEvent("anomaly:ui-action", { detail: data.ui_action }));
      }
      const aMsg: UIMessage = {
        id: uid(),
        role: "assistant",
        parts: [{ type: "text", text: data.text || "_(empty response)_" }],
      };
      setMessages((prev) => [...prev, aMsg]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({ ask: (p: string) => void submit(p) }), [busy, messages]);

  return (
    <div className="flex flex-col h-full border border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-3 font-mono text-xs tracking-widest">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
          <span className="text-primary">OMEGA THETA ∞</span>
          <span className="text-muted-foreground">/ ADAPTIVE COGNITIVE SYSTEM · UNLIMITED PROMPTS</span>
        </div>
        <div className="flex gap-1.5">
          {AGENTS.map((a) => (
            <div key={a.k} className="px-2 py-0.5 text-[9px] font-mono tracking-wider border"
              style={{ borderColor: a.c, color: a.c }} title={`${a.k} LAYER`}>{a.k}</div>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scanlines">
        {messages.length === 0 && (
          <div className="font-mono text-xs text-muted-foreground space-y-4">
            <div>
              <span className="text-primary">OMEGA://</span> Adaptive cognitive system. Ask anything — tickers, regimes, theory, free-form.
              Live Yahoo/NASDAQ feed + Oracle 100-formula behavioral state-space underneath.
            </div>
            <div>
              <span className="text-accent">QUERY EXAMPLES:</span>
              <div className="mt-2 grid gap-1.5">
                {PROMPTS.map((p) => (
                  <button key={p} onClick={() => submit(p)}
                    className="text-left px-3 py-2 border border-border bg-background/40 hover:bg-secondary hover:border-primary/50 transition-colors text-foreground">
                    &gt; {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="font-mono text-sm">
            <div className="text-[10px] tracking-widest mb-1">
              {m.role === "user"
                ? <span className="text-accent">USER://</span>
                : <span className="text-primary">OMEGA://</span>}
            </div>
            <div className="pl-3 border-l-2"
              style={{ borderColor: m.role === "user" ? "var(--accent)" : "var(--primary)" }}>
              {m.parts.map((p, i) => p.type === "text" ? (
                m.role === "assistant" ? (
                  <div key={i} className="prose prose-invert prose-sm max-w-none prose-headings:text-primary prose-headings:font-mono prose-headings:tracking-wider prose-strong:text-primary prose-table:text-xs prose-code:text-accent prose-code:bg-secondary prose-code:px-1 prose-code:rounded-none">
                    <ReactMarkdown>{p.text}</ReactMarkdown>
                  </div>
                ) : (
                  <div key={i} className="whitespace-pre-wrap text-foreground">{p.text}</div>
                )
              ) : null)}
            </div>
          </div>
        ))}

        {busy && (
          <div className="font-mono text-xs text-muted-foreground">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary mr-2" />
            SYNTHESIZING…
          </div>
        )}
        {error && (
          <div className="font-mono text-[10px] text-muted-foreground border border-border p-2">
            engine retry in progress — {error.slice(0, 80)}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-secondary/40 p-2">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); } }}
            rows={2}
            placeholder="Query the engine…  (e.g. 'NVDA deep' or 'market pulse')"
            className="flex-1 bg-background border border-border px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
          />
          <button onClick={() => submit(input)} disabled={busy || !input.trim()}
            className="px-4 py-2 font-mono text-xs tracking-widest bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity">
            EXEC
          </button>
        </div>
        <div className="mt-1 text-[10px] font-mono text-muted-foreground tracking-wider">
          ⏎ EXEC · ⇧⏎ NEWLINE · NASDAQ/YAHOO FEED · PURE DATA · NO LLM · NOT INVESTMENT ADVICE
        </div>
      </div>
    </div>
  );
});
