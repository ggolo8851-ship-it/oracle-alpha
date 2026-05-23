import { useEffect, useState } from "react";
import { listWatch, removeWatch, updateWatch, type WatchItem } from "@/lib/watchlist";

export function Watchlist({
  onPick,
  onSimulate,
}: {
  onPick: (s: string) => void;
  onSimulate: (s: string) => void;
}) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; chg: number }>>({});

  useEffect(() => {
    const refresh = () => setItems(listWatch());
    refresh();
    window.addEventListener("anomaly:watchlist-change", refresh);
    return () => window.removeEventListener("anomaly:watchlist-change", refresh);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (!items.length) return;
      try {
        const r = await fetch(`/api/snapshot?symbols=${items.map(i => i.symbol).join(",")}`);
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        const next: Record<string, { price: number; chg: number }> = {};
        for (const q of (j.quotes ?? j) as any[]) {
          if (q?.symbol) next[q.symbol] = {
            price: q.regularMarketPrice ?? 0,
            chg: q.regularMarketChangePercent ?? 0,
          };
        }
        setQuotes(next);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [items]);

  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2 flex items-center justify-between">
        <span>▸ BAG · WATCHLIST ({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="bg-card border border-border p-3 font-mono text-[10px] text-muted-foreground">
          Empty bag. Search a ticker → "ADD TO BAG" to pin it. Live alerts fire on big moves, 52w extremes, RSI flips, volume spikes.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => {
            const q = quotes[it.symbol];
            const fromEntry = it.addedPrice && q ? ((q.price / it.addedPrice - 1) * 100) : null;
            return (
              <div key={it.symbol} className="bg-card border border-border p-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <button onClick={() => onPick(it.symbol)} className="text-primary font-bold tracking-wide hover:underline">
                    {it.symbol}
                  </button>
                  <div className="flex items-center gap-2">
                    {q && (
                      <span className={q.chg >= 0 ? "text-bull" : "text-bear"}>
                        {q.chg >= 0 ? "+" : ""}{q.chg.toFixed(2)}%
                      </span>
                    )}
                    <button onClick={() => onSimulate(it.symbol)} className="text-[10px] text-accent hover:underline">SIM</button>
                    <button onClick={() => removeWatch(it.symbol)} className="text-[10px] text-muted-foreground hover:text-destructive">✕</button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                  <span>${q?.price.toFixed(2) ?? "—"}</span>
                  {fromEntry != null && (
                    <span className={fromEntry >= 0 ? "text-bull" : "text-bear"}>
                      from entry {fromEntry >= 0 ? "+" : ""}{fromEntry.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                  <label className="flex items-center gap-1">
                    alert ≥
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={it.thresholdPct}
                      onChange={(e) => updateWatch(it.symbol, { thresholdPct: Number(e.target.value) || 3 })}
                      className="w-10 bg-background border border-border px-1 text-[9px]"
                    />%
                  </label>
                  <label className="flex items-center gap-0.5">
                    <input type="checkbox" checked={it.near52w} onChange={(e) => updateWatch(it.symbol, { near52w: e.target.checked })} />
                    52w
                  </label>
                  <label className="flex items-center gap-0.5">
                    <input type="checkbox" checked={it.volSpike} onChange={(e) => updateWatch(it.symbol, { volSpike: e.target.checked })} />
                    vol
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
