import { useEffect, useState } from "react";

type Q = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
};

const LABELS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "NASDAQ",
  "^DJI": "DOW",
  "^RUT": "RUSSELL",
  "^VIX": "VIX",
  "^TNX": "US10Y",
  "DX-Y.NYB": "DXY",
  "CL=F": "WTI",
  "GC=F": "GOLD",
  "BTC-USD": "BTC",
  "ETH-USD": "ETH",
};

export function TickerTape() {
  const [quotes, setQuotes] = useState<Q[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/snapshot");
        const j = await r.json();
        if (!cancelled && j.snapshot) setQuotes(j.snapshot);
      } catch {}
    };
    load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!quotes.length) {
    return (
      <div className="h-9 border-y border-border bg-card/40 flex items-center px-4 text-xs font-mono text-muted-foreground">
        <span className="pulse-dot mr-2 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        SYNCING MARKET FEED…
      </div>
    );
  }

  const row = (
    <div className="flex items-center gap-8 px-4 shrink-0">
      {quotes.map((q) => {
        const pct = q.regularMarketChangePercent ?? 0;
        const up = pct >= 0;
        return (
          <div key={q.symbol} className="flex items-center gap-2 font-mono text-xs">
            <span className="text-muted-foreground tracking-wider">
              {LABELS[q.symbol] ?? q.symbol}
            </span>
            <span className="text-foreground">
              {q.regularMarketPrice?.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
            <span style={{ color: up ? "var(--bull)" : "var(--bear)" }}>
              {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="h-9 border-y border-border bg-card/60 overflow-hidden flex items-center">
      <div className="flex ticker-scroll whitespace-nowrap">
        {row}
        {row}
      </div>
    </div>
  );
}
