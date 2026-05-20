import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const AGENTS = [
  { k: "QUANT", c: "oklch(0.78 0.18 70)" },
  { k: "SENTIMENT", c: "oklch(0.65 0.18 235)" },
  { k: "MACRO", c: "oklch(0.78 0.2 145)" },
  { k: "BEHAVIOR", c: "oklch(0.7 0.22 320)" },
  { k: "RISK", c: "oklch(0.66 0.24 22)" },
  { k: "OPPORTUNITY", c: "oklch(0.82 0.18 85)" },
];

const PROMPTS = [
  "Full macro brief: rates, liquidity, dollar, risk regime.",
  "Deep multi-agent synthesis on NVDA right now.",
  "Where is the highest asymmetric upside this week?",
  "Model the current fear/greed regime in the S&P.",
  "Volatility map: what is VIX pricing vs. realized?",
];

export function OracleConsole() {
  const [transport] = useState(
    () => new DefaultChatTransport({ api: "/api/chat" }),
  );
  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [status]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full border border-border bg-card/60 backdrop-blur">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-3 font-mono text-xs tracking-widest">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-primary" />
          <span className="text-primary">ORACLE ALPHA ∞</span>
          <span className="text-muted-foreground">/ RECURSIVE SYNTHESIS ENGINE</span>
        </div>
        <div className="flex gap-1.5">
          {AGENTS.map((a) => (
            <div
              key={a.k}
              className="px-2 py-0.5 text-[9px] font-mono tracking-wider border"
              style={{ borderColor: a.c, color: a.c }}
              title={`${a.k} AGENT`}
            >
              {a.k}
            </div>
          ))}
        </div>
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scanlines"
      >
        {messages.length === 0 && (
          <div className="font-mono text-xs text-muted-foreground space-y-4">
            <div>
              <span className="text-primary">ORACLE://</span> system initialized.
              All 6 agents online. Connected to NASDAQ / Yahoo Finance feed.
            </div>
            <div>
              <span className="text-accent">QUERY EXAMPLES:</span>
              <div className="mt-2 grid gap-1.5">
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => submit(p)}
                    className="text-left px-3 py-2 border border-border bg-background/40 hover:bg-secondary hover:border-primary/50 transition-colors text-foreground"
                  >
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
              {m.role === "user" ? (
                <span className="text-accent">USER://</span>
              ) : (
                <span className="text-primary">ORACLE://</span>
              )}
            </div>
            <div className="pl-3 border-l-2" style={{ borderColor: m.role === "user" ? "var(--accent)" : "var(--primary)" }}>
              {m.parts.map((p, i) => {
                if (p.type === "text") {
                  return m.role === "assistant" ? (
                    <div
                      key={i}
                      className="prose prose-invert prose-sm max-w-none prose-headings:text-primary prose-headings:font-mono prose-headings:tracking-wider prose-strong:text-primary prose-table:text-xs prose-code:text-accent prose-code:bg-secondary prose-code:px-1 prose-code:rounded-none prose-th:border-border prose-td:border-border prose-table:border prose-table:border-border"
                    >
                      <ReactMarkdown>{p.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <div key={i} className="whitespace-pre-wrap text-foreground">
                      {p.text}
                    </div>
                  );
                }
                if (p.type.startsWith("tool-")) {
                  const tp = p as any;
                  const name = p.type.replace("tool-", "");
                  const state = tp.state as string;
                  return (
                    <details
                      key={i}
                      className="my-2 border border-border bg-background/60 text-xs"
                    >
                      <summary className="cursor-pointer px-2 py-1 flex items-center gap-2 list-none">
                        <span className="text-accent">⟐</span>
                        <span className="text-muted-foreground tracking-wider">
                          TOOL
                        </span>
                        <span className="text-primary">{name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {state === "output-available"
                            ? "✓ OK"
                            : state === "output-error"
                              ? "✗ ERR"
                              : "… RUNNING"}
                        </span>
                      </summary>
                      <div className="border-t border-border p-2 space-y-2 max-h-72 overflow-auto">
                        {tp.input && (
                          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">
                            {JSON.stringify(tp.input, null, 2)}
                          </pre>
                        )}
                        {tp.output && (
                          <pre className="text-[10px] text-foreground whitespace-pre-wrap">
                            {JSON.stringify(tp.output, null, 2)}
                          </pre>
                        )}
                      </div>
                    </details>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {status === "submitted" && (
          <div className="font-mono text-xs text-muted-foreground">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary mr-2" />
            RECURSIVE SYNTHESIS RUNNING…
          </div>
        )}
        {error && (
          <div className="font-mono text-xs text-destructive border border-destructive/50 p-2">
            ERR: {error.message}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-border bg-secondary/40 p-2">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={2}
            placeholder="Query the engine…  (e.g. 'multi-agent synthesis on TSLA')"
            className="flex-1 bg-background border border-border px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={() => submit(input)}
              disabled={busy || !input.trim()}
              className="px-4 py-2 font-mono text-xs tracking-widest bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity"
            >
              EXEC
            </button>
            {busy && (
              <button
                onClick={() => stop()}
                className="px-4 py-1 font-mono text-[10px] tracking-widest border border-destructive text-destructive hover:bg-destructive/20"
              >
                STOP
              </button>
            )}
          </div>
        </div>
        <div className="mt-1 text-[10px] font-mono text-muted-foreground tracking-wider">
          ⏎ EXEC · ⇧⏎ NEWLINE · NASDAQ/YAHOO FEED · NOT INVESTMENT ADVICE
        </div>
      </div>
    </div>
  );
}
