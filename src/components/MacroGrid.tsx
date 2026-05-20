import { useEffect, useState } from "react";

type Q = {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
};

const KEY_TICKERS = [
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq"],
  ["^VIX", "VIX"],
  ["^TNX", "US 10Y"],
  ["DX-Y.NYB", "DXY"],
  ["GC=F", "Gold"],
  ["CL=F", "WTI Crude"],
  ["BTC-USD", "Bitcoin"],
];

export function MacroGrid() {
  const [data, setData] = useState<Record<string, Q>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const r = await fetch("/api/snapshot");
      const j = await r.json();
      if (cancelled || !j.snapshot) return;
      const map: Record<string, Q> = {};
      for (const q of j.snapshot as Q[]) map[q.symbol] = q;
      setData(map);
    };
    load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-px bg-border border border-border">
      {KEY_TICKERS.map(([sym, label]) => {
        const q = data[sym];
        const pct = q?.regularMarketChangePercent ?? 0;
        const up = pct >= 0;
        const range =
          q?.fiftyTwoWeekLow != null && q?.fiftyTwoWeekHigh != null && q?.regularMarketPrice != null
            ? Math.min(
                100,
                Math.max(
                  0,
                  ((q.regularMarketPrice - q.fiftyTwoWeekLow) /
                    (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) *
                    100,
                ),
              )
            : null;
        return (
          <div key={sym} className="bg-card p-3 font-mono">
            <div className="flex items-center justify-between text-[10px] tracking-widest text-muted-foreground">
              <span>{label.toUpperCase()}</span>
              <span>{sym}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg text-foreground">
                {q?.regularMarketPrice?.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                }) ?? "—"}
              </span>
              <span
                className="text-xs"
                style={{ color: up ? "var(--bull)" : "var(--bear)" }}
              >
                {q ? `${up ? "+" : ""}${pct.toFixed(2)}%` : ""}
              </span>
            </div>
            {range != null && (
              <div className="mt-2">
                <div className="h-1 bg-secondary relative overflow-hidden">
                  <div
                    className="absolute top-0 h-full w-0.5"
                    style={{ left: `${range}%`, background: "var(--primary)" }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                  <span>52W L {q?.fiftyTwoWeekLow?.toFixed(2)}</span>
                  <span>{q?.fiftyTwoWeekHigh?.toFixed(2)} H</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
