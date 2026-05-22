import { useEffect, useState } from "react";

type Pulse = {
  generated_at: string;
  risk_regime: string;
  liquidity_regime: string;
  fear_greed: { score: number; regime: string; components: Record<string, number> } | null;
  market_breath: { spx_chg_pct?: number; ndx_chg_pct?: number; vix?: number; ust10y?: number };
  top_bullish: { symbol: string; score: number; signal: string }[];
  highest_anomalies: { symbol: string; anomaly_score: number; signals: string[] }[];
  narrative_dominant: string;
};

export function MarketPulse({ onPick }: { onPick: (s: string) => void }) {
  const [p, setP] = useState<Pulse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch("/api/pulse");
      const j = await r.json();
      if (alive) setP(j);
    };
    load();
    const id = setInterval(load, 3 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!p) return <div className="font-mono text-xs text-muted-foreground">computing global pulse…</div>;

  return (
    <div className="font-mono space-y-4">
      <div>
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ AI GLOBAL MARKET PULSE</div>
        <div className="text-lg tracking-widest text-primary">EXECUTIVE SUMMARY</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Tile label="REGIME" value={p.risk_regime} accent="text-primary" />
        <Tile label="LIQUIDITY" value={p.liquidity_regime} />
        <Tile label="FEAR/GREED" value={p.fear_greed ? `${p.fear_greed.score} ${p.fear_greed.regime}` : "—"} accent="text-warn" />
        <Tile label="VIX" value={p.market_breath.vix?.toFixed(2) ?? "—"} />
        <Tile label="SPX %" value={fmtPct(p.market_breath.spx_chg_pct)} />
        <Tile label="NDX %" value={fmtPct(p.market_breath.ndx_chg_pct)} />
        <Tile label="UST 10Y" value={p.market_breath.ust10y?.toFixed(2) ?? "—"} />
        <Tile label="UPDATED" value={new Date(p.generated_at).toLocaleTimeString()} />
      </div>

      <div className="bg-card border border-border p-3 text-xs">
        <div className="text-[10px] text-muted-foreground tracking-widest mb-1">DOMINANT NARRATIVE</div>
        <div className="text-foreground">{p.narrative_dominant}</div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-card border border-border p-3">
          <div className="text-[10px] text-muted-foreground tracking-widest mb-2">TOP BULLISH SIGNALS</div>
          <div className="space-y-1 text-xs">
            {p.top_bullish.map(t => (
              <button key={t.symbol} onClick={() => onPick(t.symbol)} className="w-full flex justify-between hover:text-primary">
                <span className="text-primary">{t.symbol}</span>
                <span className="text-muted-foreground">{t.signal}</span>
                <span className="text-bull">{t.score.toFixed(1)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border p-3">
          <div className="text-[10px] text-muted-foreground tracking-widest mb-2">HIGHEST ANOMALIES</div>
          <div className="space-y-1 text-xs">
            {p.highest_anomalies.map(a => (
              <button key={a.symbol} onClick={() => onPick(a.symbol)} className="w-full flex justify-between hover:text-primary">
                <span className="text-primary">{a.symbol}</span>
                <span className="text-muted-foreground truncate ml-2">{a.signals.slice(0,2).join(",")}</span>
                <span className="text-warn">{a.anomaly_score}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {p.fear_greed && (
        <div className="bg-card border border-border p-3 text-xs">
          <div className="text-[10px] text-muted-foreground tracking-widest mb-2">FEAR/GREED COMPONENTS</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(p.fear_greed.components).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent = "text-foreground" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-card border border-border p-2">
      <div className="text-[10px] text-muted-foreground tracking-widest">{label}</div>
      <div className={`text-sm ${accent}`}>{value}</div>
    </div>
  );
}

function fmtPct(n?: number) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
