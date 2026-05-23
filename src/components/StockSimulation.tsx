// Monte Carlo fan-chart simulation viewer. Pulls /api/simulate which
// runs GBM anchored to Oracle100 behavioral drift.
import { useEffect, useState } from "react";

type SimResp = {
  symbol: string; horizon: number; paths: number;
  last_price: number; mu_daily: number; sigma_daily: number;
  behavioral_bias_daily: number; oracle_signal: number | null;
  fan: { p05: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  sample_paths: number[][];
  terminal: { expected: number; prob_up: number; prob_up_10pct: number; prob_dn_10pct: number; p05: number; p95: number };
};

export function StockSimulation({ symbol, onAsk }: { symbol: string; onAsk?: (p: string) => void }) {
  const [horizon, setHorizon] = useState(60);
  const [data, setData] = useState<SimResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/simulate?symbol=${encodeURIComponent(symbol)}&horizon=${horizon}&paths=250`);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? r.statusText);
      setData(j);
    } catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { run(); /* eslint-disable-next-line */ }, [symbol, horizon]);

  return (
    <div className="bg-card border border-border p-3 font-mono">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ MONTE CARLO · ORACLE-DRIVEN</div>
          <div className="text-sm tracking-widest text-primary">{symbol} · {horizon}D PROJECTION</div>
        </div>
        <div className="flex gap-1">
          {[30, 60, 120, 252].map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className={`px-2 py-1 text-[10px] tracking-widest border ${horizon === h ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-primary"}`}>
              {h}D
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-[10px] text-muted-foreground">simulating 250 paths…</div>}
      {err && <div className="text-[10px] text-destructive">ERR: {err}</div>}

      {data && (
        <>
          <FanChart data={data} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-[10px]">
            <Stat label="LAST" value={`$${data.last_price.toFixed(2)}`} />
            <Stat label="EXPECTED" value={`$${data.terminal.expected.toFixed(2)}`} />
            <Stat label="P(UP)" value={`${(data.terminal.prob_up * 100).toFixed(1)}%`} color={data.terminal.prob_up >= 0.5 ? "bull" : "bear"} />
            <Stat label="ORACLE Ψ" value={data.oracle_signal != null ? data.oracle_signal.toFixed(3) : "—"} color={data.oracle_signal != null ? (data.oracle_signal >= 0 ? "bull" : "bear") : undefined} />
            <Stat label="P(+10%)" value={`${(data.terminal.prob_up_10pct * 100).toFixed(1)}%`} color="bull" />
            <Stat label="P(−10%)" value={`${(data.terminal.prob_dn_10pct * 100).toFixed(1)}%`} color="bear" />
            <Stat label="95% LO" value={`$${data.terminal.p05.toFixed(2)}`} />
            <Stat label="95% HI" value={`$${data.terminal.p95.toFixed(2)}`} />
          </div>
          {onAsk && (
            <button
              onClick={() => onAsk(`Run a full Oracle synthesis on ${symbol}. The ${horizon}d Monte Carlo (250 paths, drift-anchored to Oracle100 signal=${data.oracle_signal}) shows P(up)=${(data.terminal.prob_up*100).toFixed(1)}%, expected=$${data.terminal.expected.toFixed(2)}, 95% band [$${data.terminal.p05.toFixed(2)}, $${data.terminal.p95.toFixed(2)}]. Synthesize quant + behavior + risk + scenarios.`)}
              className="mt-3 text-[10px] text-primary hover:underline"
            >→ Ask Oracle to synthesize this simulation</button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: "bull" | "bear" }) {
  return (
    <div className="border border-border bg-background/40 p-2">
      <div className="text-[9px] tracking-widest text-muted-foreground">{label}</div>
      <div className={color === "bull" ? "text-bull" : color === "bear" ? "text-bear" : "text-foreground"}>{value}</div>
    </div>
  );
}

function FanChart({ data }: { data: SimResp }) {
  const W = 720, H = 240, PADX = 36, PADY = 14;
  const { p05, p25, p50, p75, p95 } = data.fan;
  const n = p50.length;
  const all = [...p05, ...p95, data.last_price];
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number) => PADX + (i / (n - 1)) * (W - PADX * 2);
  const y = (v: number) => H - PADY - ((v - min) / span) * (H - PADY * 2);

  const band = (a: number[], b: number[]) =>
    `M ${a.map((v, i) => `${x(i)},${y(v)}`).join(" L ")} ` +
    `L ${b.slice().reverse().map((v, i) => `${x(b.length - 1 - i)},${y(v)}`).join(" L ")} Z`;
  const line = (s: number[]) => `M ${s.map((v, i) => `${x(i)},${y(v)}`).join(" L ")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <path d={band(p05, p95)} fill="oklch(0.7 0.18 235 / 0.12)" />
      <path d={band(p25, p75)} fill="oklch(0.7 0.18 235 / 0.25)" />
      <path d={line(p50)} stroke="oklch(0.78 0.18 70)" strokeWidth={1.5} fill="none" />
      {data.sample_paths.slice(0, 12).map((pp, idx) => (
        <path key={idx} d={line(pp)} stroke="oklch(0.65 0.18 235 / 0.18)" strokeWidth={0.5} fill="none" />
      ))}
      <line x1={PADX} x2={W - PADX} y1={y(data.last_price)} y2={y(data.last_price)}
        stroke="oklch(0.65 0 0)" strokeDasharray="3,3" strokeWidth={0.8} />
      <text x={W - PADX} y={y(data.last_price) - 4} textAnchor="end" fontSize={9} fill="oklch(0.7 0 0)" fontFamily="monospace">
        spot ${data.last_price.toFixed(2)}
      </text>
      <text x={PADX} y={12} fontSize={9} fill="oklch(0.7 0 0)" fontFamily="monospace">
        ${max.toFixed(2)}
      </text>
      <text x={PADX} y={H - 4} fontSize={9} fill="oklch(0.7 0 0)" fontFamily="monospace">
        ${min.toFixed(2)}
      </text>
    </svg>
  );
}
