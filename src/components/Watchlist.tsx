import { useEffect, useState } from "react";
import {
  listWatch, removeWatch, updateWatch, type WatchItem,
  listPredictions, removePrediction, predTarget, type Prediction,
} from "@/lib/watchlist";

export function Watchlist({
  onPick,
  onSimulate,
}: {
  onPick: (s: string) => void;
  onSimulate: (s: string) => void;
}) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; chg: number }>>({});

  useEffect(() => {
    const refresh = () => setItems(listWatch());
    const refreshP = () => setPreds(listPredictions());
    refresh(); refreshP();
    window.addEventListener("anomaly:watchlist-change", refresh);
    window.addEventListener("anomaly:predictions-change", refreshP);
    const id = setInterval(refreshP, 20_000);
    return () => {
      clearInterval(id);
      window.removeEventListener("anomaly:watchlist-change", refresh);
      window.removeEventListener("anomaly:predictions-change", refreshP);
    };
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
        <div className="bg-card border border-border p-3 font-mono text-[10px] text-muted-foreground space-y-1.5">
          <div className="text-foreground">Empty bag.</div>
          <div>Search a ticker → "ADD TO BAG", or just tell Oracle <span className="text-accent">"add NVDA to my bag"</span> — it can pin tickers for you.</div>
          <div className="text-muted-foreground">Live alerts auto-fire on: intraday %, 52w extremes, volume spikes.</div>
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

      <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mt-4 mb-2">
        ▸ TRACKED CALLS ({preds.filter(p => p.status === "live").length} live)
      </div>
      {preds.length === 0 ? (
        <div className="bg-card border border-border p-3 font-mono text-[10px] text-muted-foreground">
          No tracked predictions. Ask Oracle <span className="text-accent">"track your SMCI call and notify me"</span> — it pins the target, stop and horizon, then alerts you when it hits, stops out, or expires.
        </div>
      ) : (
        <div className="space-y-1.5">
          {preds.slice(0, 25).map((p) => {
            const q = quotes[p.symbol];
            const tgt = predTarget(p, q?.price);
            const base = p.spot ?? q?.price;
            const prog = tgt != null && base != null && q ? Math.max(0, Math.min(100, ((q.price - base) / (tgt - base)) * 100)) : null;
            const color = p.status === "hit" ? "text-bull" : p.status === "stopped" ? "text-bear" : p.status === "expired" ? "text-muted-foreground" : "text-accent";
            return (
              <div key={p.id} className="bg-card border border-border p-2 font-mono text-[10px]">
                <div className="flex items-center justify-between">
                  <button onClick={() => onPick(p.symbol)} className="text-primary font-bold tracking-wide hover:underline text-xs">{p.symbol}</button>
                  <div className="flex items-center gap-2">
                    <span className={color}>{p.status.toUpperCase()}</span>
                    <button onClick={() => removePrediction(p.id)} className="text-muted-foreground hover:text-destructive">✕</button>
                  </div>
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                  <span>entry ${base?.toFixed(2) ?? "—"}</span>
                  <span>target ${tgt?.toFixed(2) ?? "—"}</span>
                  {p.stopPct != null && <span>stop −{p.stopPct}%</span>}
                  <span>{p.horizonHours}h</span>
                </div>
                {prog != null && p.status === "live" && (
                  <div className="h-1 bg-secondary mt-1.5">
                    <div className="h-full bg-accent" style={{ width: `${prog}%` }} />
                  </div>
                )}
                {p.note && <div className="text-muted-foreground mt-1 italic">{p.note}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
