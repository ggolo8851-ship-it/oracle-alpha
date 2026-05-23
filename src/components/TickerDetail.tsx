import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addWatch, isWatched, removeWatch } from "@/lib/watchlist";
import { StockSimulation } from "./StockSimulation";

type Detail = {
  symbol: string;
  quote: any;
  sparkline: number[];
  stats: { sma50: number | null; sma200: number | null; rsi14: number | null };
  ts: number;
};

export function TickerDetail({
  symbol,
  onClose,
  onAskOracle,
}: {
  symbol: string;
  onClose: () => void;
  onAskOracle: (prompt: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [showSim, setShowSim] = useState(false);
  useEffect(() => { setWatched(isWatched(symbol)); setShowSim(false); }, [symbol]);
  const toggleWatch = () => {
    if (watched) { removeWatch(symbol); setWatched(false); toast(`${symbol} removed from bag`); }
    else { addWatch(symbol, d?.quote?.regularMarketPrice); setWatched(true); toast.success(`${symbol} added to bag · live alerts ON`); }
  };

  useEffect(() => {
    let cancelled = false;
    setD(null);
    setErr(null);
    (async () => {
      try {
        const r = await fetch(`/api/ticker?s=${encodeURIComponent(symbol)}`);
        const j = await r.json();
        if (cancelled) return;
        if (j.error) setErr(j.error);
        else setD(j);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const q = d?.quote ?? {};
  const price = q.regularMarketPrice;
  const pct = q.regularMarketChangePercent ?? 0;
  const up = pct >= 0;
  const lo = q.fiftyTwoWeekLow;
  const hi = q.fiftyTwoWeekHigh;
  const rangePct =
    lo != null && hi != null && price != null
      ? Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100))
      : null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full max-w-md bg-card border-l border-border overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/40 sticky top-0">
          <div className="font-mono text-xs tracking-widest">
            <span className="text-primary">{symbol}</span>
            <span className="text-muted-foreground"> · TICKER INTEL</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-primary font-mono text-xs"
          >
            ✕ CLOSE
          </button>
        </div>

        {err && (
          <div className="p-4 font-mono text-xs text-destructive">ERR: {err}</div>
        )}
        {!d && !err && (
          <div className="p-4 font-mono text-xs text-muted-foreground">SYNCING…</div>
        )}

        {d && (
          <div className="p-4 space-y-4 font-mono text-xs">
            <div>
              <div className="text-muted-foreground tracking-widest">
                {q.shortName ?? q.longName ?? symbol}
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl text-foreground">
                  {price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span style={{ color: up ? "var(--bull)" : "var(--bear)" }}>
                  {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground tracking-widest mt-1">
                {q.exchange ?? "NASDAQ/NYSE"} · {q.currency ?? "USD"} · DELAYED ~15M · YAHOO/NASDAQ FEED
              </div>
            </div>

            {d.sparkline.length > 1 && <Sparkline data={d.sparkline} up={up} />}

            {rangePct != null && (
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest mb-1">
                  52W RANGE
                </div>
                <div className="h-1.5 bg-secondary relative">
                  <div
                    className="absolute top-0 h-full w-1"
                    style={{ left: `${rangePct}%`, background: "var(--primary)" }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>L {lo?.toFixed(2)}</span>
                  <span>{rangePct.toFixed(0)}%</span>
                  <span>{hi?.toFixed(2)} H</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-px bg-border border border-border">
              <Stat label="DAY HIGH" v={q.regularMarketDayHigh?.toFixed(2)} />
              <Stat label="DAY LOW" v={q.regularMarketDayLow?.toFixed(2)} />
              <Stat label="VOLUME" v={fmtBig(q.regularMarketVolume)} />
              <Stat label="SMA 50" v={d.stats.sma50?.toFixed(2) ?? "—"} />
              <Stat label="SMA 200" v={d.stats.sma200?.toFixed(2) ?? "—"} />
              <Stat
                label="RSI 14"
                v={d.stats.rsi14?.toFixed(0) ?? "—"}
                accent={
                  d.stats.rsi14 != null
                    ? d.stats.rsi14 > 70
                      ? "var(--bear)"
                      : d.stats.rsi14 < 30
                      ? "var(--bull)"
                      : undefined
                    : undefined
                }
              />
            </div>

            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleWatch}
                  className={`px-3 py-2 tracking-widest border ${watched ? "border-bear text-bear hover:bg-bear/10" : "border-bull text-bull hover:bg-bull/10"}`}
                >
                  {watched ? "✕ REMOVE FROM BAG" : "＋ ADD TO BAG"}
                </button>
                <button
                  onClick={() => setShowSim(s => !s)}
                  className="px-3 py-2 border border-primary text-primary tracking-widest hover:bg-primary/10"
                >
                  {showSim ? "− HIDE SIM" : "Φ SIMULATE"}
                </button>
              </div>

              {showSim && <StockSimulation symbol={symbol} onAsk={onAskOracle} />}

              <button
                onClick={() =>
                  onAskOracle(
                    `Full multi-agent synthesis on ${symbol}: quant technicals, behavioral read, macro context, risk geometry, scenarios, and asymmetric setups. Use get_technicals, get_behavioral_read, get_fear_greed, and get_quotes.`,
                  )
                }
                className="w-full px-3 py-2 bg-primary text-primary-foreground tracking-widest hover:opacity-90"
              >
                ▶ FULL ORACLE SYNTHESIS ON {symbol}
              </button>
              <button
                onClick={() =>
                  onAskOracle(
                    `Behavioral finance deep-dive on ${symbol}: anchoring, reflexivity, crowding, recency bias, and dominant narratives. Use get_behavioral_read and run_oracle100.`,
                  )
                }
                className="w-full px-3 py-2 border border-accent text-accent tracking-widest hover:bg-accent/10"
              >
                ⚡ BEHAVIORAL DEEP-DIVE
              </button>
              <button
                onClick={() =>
                  onAskOracle(
                    `Technical & quant profile of ${symbol}: trend regime, vol regime, RSI/MACD, Sharpe/Sortino, drawdown geometry. Use get_technicals.`,
                  )
                }
                className="w-full px-3 py-2 border border-border text-foreground tracking-widest hover:bg-secondary"
              >
                Σ QUANT PROFILE
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({
  label,
  v,
  accent,
}: {
  label: string;
  v?: string | number | null;
  accent?: string;
}) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[9px] tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm" style={{ color: accent ?? "var(--foreground)" }}>
        {v ?? "—"}
      </div>
    </div>
  );
}

function fmtBig(n?: number) {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const w = 360, h = 80, p = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = p + (i / (data.length - 1)) * (w - p * 2);
      const y = h - p - ((v - min) / range) * (h - p * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up ? "var(--bull)" : "var(--bear)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-20 bg-background border border-border"
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
