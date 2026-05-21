import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MacroGrid } from "@/components/MacroGrid";
import { OracleConsole, type OracleHandle } from "@/components/OracleConsole";
import { TickerTape } from "@/components/TickerTape";
import { SymbolSearch } from "@/components/SymbolSearch";
import { TickerDetail } from "@/components/TickerDetail";
import { TopFinds } from "@/components/TopFinds";
import { ThreadList } from "@/components/ThreadList";
import {
  getActiveId,
  getThread,
  listThreads,
  newThread,
  setActiveId,
} from "@/lib/threads";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "ANOMALY ∞ — Oracle Alpha Institutional Intelligence" },
      {
        name: "description",
        content:
          "Recursive institutional-grade financial intelligence terminal. Multi-agent synthesis across quant, macro, sentiment, behavior, risk, and opportunity, grounded in live NASDAQ/Yahoo data.",
      },
    ],
  }),
});

function Index() {
  const [threadId, setThreadId] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const oracleRef = useRef<OracleHandle>(null);

  // Bootstrap a thread on mount.
  useEffect(() => {
    const id = getActiveId();
    if (id && getThread(id)) {
      const t = getThread(id)!;
      setThreadId(t.id);
      setInitialMessages(t.messages);
    } else if (listThreads().length) {
      const t = listThreads()[0];
      setActiveId(t.id);
      setThreadId(t.id);
      setInitialMessages(t.messages);
    } else {
      const t = newThread();
      setThreadId(t.id);
      setInitialMessages([]);
    }
  }, []);

  const switchThread = (id: string) => {
    if (!id) {
      const t = newThread();
      setActiveId(t.id);
      setThreadId(t.id);
      setInitialMessages([]);
      setRefreshKey((k) => k + 1);
      return;
    }
    const t = getThread(id);
    if (!t) return;
    setActiveId(id);
    setThreadId(id);
    setInitialMessages(t.messages);
    setRefreshKey((k) => k + 1);
  };

  const askOracle = (prompt: string) => {
    setActiveSymbol(null);
    setTimeout(() => oracleRef.current?.ask(prompt), 50);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="font-mono">
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground">
                ANOMALY
              </div>
              <div className="text-xl tracking-widest text-primary leading-none">
                ∞
                <span className="text-foreground text-sm ml-2 tracking-[0.2em]">
                  ORACLE ALPHA
                </span>
              </div>
            </div>
            <div className="hidden md:flex gap-1 ml-6">
              {["MARKETS", "AGENTS", "FINDS", "BEHAVIOR", "RISK"].map((t) => (
                <div
                  key={t}
                  className="px-3 py-1 font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary hover:bg-secondary transition-colors cursor-default"
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[220px] flex justify-center">
            <SymbolSearch onPick={(s) => setActiveSymbol(s)} />
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] tracking-widest text-muted-foreground">
            <Clock />
            <span className="text-bull">● FEED LIVE</span>
          </div>
        </div>
      </header>

      <TickerTape />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-px bg-border">
        <aside className="bg-background p-3 space-y-4 overflow-y-auto">
          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">
              ▸ MACRO GRID
            </div>
            <MacroGrid />
          </div>

          <TopFinds onPick={(s) => setActiveSymbol(s)} />

          <ThreadList
            activeId={threadId}
            onSelect={switchThread}
            refreshKey={refreshKey}
          />

          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">
              ▸ AGENT STACK
            </div>
            <div className="space-y-1 font-mono text-xs">
              {[
                ["Q", "QUANT", "factors · vol · corr · microstructure"],
                ["S", "SENTIMENT", "narrative · social · attention"],
                ["M", "MACRO", "rates · liquidity · FX · geopolitics"],
                ["H", "BEHAVIOR", "anchoring · reflexivity · crowding"],
                ["R", "RISK", "tails · drawdown · liquidity stress"],
                ["O", "OPPORTUNITY", "asymmetric upside · inflections"],
              ].map(([k, n, d]) => (
                <div key={n} className="flex gap-2 p-2 bg-card border border-border">
                  <div className="h-6 w-6 flex items-center justify-center bg-primary text-primary-foreground font-bold">
                    {k}
                  </div>
                  <div className="flex-1">
                    <div className="text-foreground">{n}</div>
                    <div className="text-[10px] text-muted-foreground">{d}</div>
                  </div>
                  <div className="text-[9px] text-bull self-center">ONLINE</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">
              ▸ ENGINE
            </div>
            <div className="bg-card border border-border p-3 font-mono text-[10px] text-muted-foreground space-y-1.5">
              <div>Ω(t) recursive cognition</div>
              <div>P_forecast probabilistic engine</div>
              <div>σ² stochastic volatility</div>
              <div>Φ scenario simulation</div>
              <div className="text-warn pt-1 border-t border-border">
                ⚠ Not investment advice. Research only.
              </div>
            </div>
          </div>
        </aside>

        <section className="bg-background p-3 min-h-[70vh]">
          {threadId && (
            <OracleConsole
              ref={oracleRef}
              key={threadId}
              threadId={threadId}
              initialMessages={initialMessages}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-border bg-card/80 px-4 py-2 font-mono text-[10px] tracking-widest text-muted-foreground flex justify-between">
        <span>ANOMALY ∞ · RECURSIVE FINANCIAL INTELLIGENCE</span>
        <span>NASDAQ / YAHOO FEED · DELAYED ≤15M · EDUCATIONAL USE ONLY</span>
      </footer>

      {activeSymbol && (
        <TickerDetail
          symbol={activeSymbol}
          onClose={() => setActiveSymbol(null)}
          onAskOracle={askOracle}
        />
      )}
    </div>
  );
}

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-US", {
        hour12: false,
        timeZone: "America/New_York",
      }) + " ET";
    setT(fmt());
    const id = setInterval(() => setT(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{t}</span>;
}
