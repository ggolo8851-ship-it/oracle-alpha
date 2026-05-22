import { useEffect, useState } from "react";

type Mover = {
  rank: number; symbol: string; name?: string; price: number | null;
  change_pct: number; confidence: number; anomaly_score: number;
  bull_prob: number; bear_prob: number; vol_estimate_pct: number;
  timeframe: string; catalyst: string; why: string; signals: string[];
};

export function NextBigMovers({ onPick, onAsk }: { onPick: (s: string) => void; onAsk: (s: string) => void }) {
  const [data, setData] = useState<{ movers: Mover[]; generated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/next-big");
        const j = await r.json();
        if (alive) setData(j);
      } finally { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="font-mono">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ ANOMALY SCANNER</div>
          <div className="text-lg tracking-widest text-primary">NEXT BIG MOVERS</div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {loading ? "scanning…" : data && `${data.movers.length} hits · ${new Date(data.generated_at).toLocaleTimeString()}`}
        </div>
      </div>
      <div className="grid gap-2">
        {(data?.movers ?? []).map((m) => (
          <div key={m.symbol} className="bg-card border border-border p-3 text-xs hover:border-primary transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="text-muted-foreground text-[10px] w-6 pt-0.5">#{m.rank}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => onPick(m.symbol)} className="text-primary font-bold tracking-wide hover:underline">{m.symbol}</button>
                    <span className="text-muted-foreground text-[10px] truncate">{m.name}</span>
                    <span className={`text-[10px] ${m.change_pct >= 0 ? "text-bull" : "text-bear"}`}>
                      {m.change_pct >= 0 ? "+" : ""}{m.change_pct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-foreground mt-1 leading-snug">{m.catalyst}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{m.why}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.signals.slice(0, 4).map((s) => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 bg-secondary text-primary tracking-wide">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div><span className="text-muted-foreground text-[10px]">CONF</span> <span className="text-foreground">{m.confidence}</span></div>
                <div><span className="text-muted-foreground text-[10px]">ANOM</span> <span className="text-warn">{m.anomaly_score}</span></div>
                <div className="text-[10px]">
                  <span className="text-bull">{m.bull_prob}%</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-bear">{m.bear_prob}%</span>
                </div>
                <div className="text-[10px] text-muted-foreground">σ {m.vol_estimate_pct}% · {m.timeframe}</div>
                <button onClick={() => onAsk(`Deep-dive ${m.symbol}: synthesize quant, behavior, and risk on this anomaly. Catalyst: ${m.catalyst}`)}
                  className="text-[10px] text-primary hover:underline">ask oracle →</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
