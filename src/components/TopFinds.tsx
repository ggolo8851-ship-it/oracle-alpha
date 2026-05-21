import { useEffect, useState } from "react";

type Find = {
  rank: number;
  symbol: string;
  name?: string;
  price: number | null;
  change_pct: number;
  score: number;
  signal: string;
  rs_vs_spy: number | null;
  rsi14: number | null;
  ret_5d: number | null;
  ret_20d: number | null;
  vol_thrust: number | null;
};

const SIGNAL_COLOR: Record<string, string> = {
  BREAKOUT: "var(--bull)",
  MOMENTUM: "var(--primary)",
  VOLUME_THRUST: "var(--accent)",
  REVERSAL: "var(--warn)",
  ACCUMULATION: "var(--accent)",
  OVEREXTENDED: "var(--bear)",
};

export function TopFinds({ onPick }: { onPick: (sym: string) => void }) {
  const [finds, setFinds] = useState<Find[]>([]);
  const [ts, setTs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/top-finds");
        const j = await r.json();
        if (cancelled) return;
        setFinds(j.finds ?? []);
        setTs(j.generated_at ?? null);
      } catch {}
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const maxScore = Math.max(...finds.map((f) => f.score), 100);

  return (
    <div className="border border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/40">
        <div className="font-mono text-[10px] tracking-[0.25em] text-primary">
          ▸ TOP 10 FINDS · LIVE SCANNER
        </div>
        <div className="font-mono text-[9px] text-muted-foreground tracking-widest">
          {ts ? new Date(ts).toLocaleTimeString() : "—"}
        </div>
      </div>
      {loading && (
        <div className="px-3 py-4 font-mono text-[11px] text-muted-foreground">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary mr-2" />
          SCANNING 60-SYMBOL UNIVERSE…
        </div>
      )}
      <div className="divide-y divide-border">
        {finds.map((f) => {
          const up = f.change_pct >= 0;
          const sigColor = SIGNAL_COLOR[f.signal] ?? "var(--muted-foreground)";
          const widthPct = Math.max(4, Math.min(100, (f.score / maxScore) * 100));
          return (
            <button
              key={f.symbol}
              onClick={() => onPick(f.symbol)}
              className="w-full text-left px-3 py-2 font-mono hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-5">
                  #{f.rank}
                </span>
                <span className="text-primary w-14 text-xs">{f.symbol}</span>
                <span className="flex-1 truncate text-[10px] text-muted-foreground">
                  {f.name}
                </span>
                <span className="text-xs text-foreground tabular-nums">
                  {f.price?.toFixed(2)}
                </span>
                <span
                  className="text-[10px] tabular-nums w-14 text-right"
                  style={{ color: up ? "var(--bull)" : "var(--bear)" }}
                >
                  {up ? "+" : ""}
                  {f.change_pct.toFixed(2)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-secondary relative overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full"
                    style={{ width: `${widthPct}%`, background: sigColor }}
                  />
                </div>
                <span
                  className="text-[9px] tracking-widest px-1.5 py-0.5 border"
                  style={{ borderColor: sigColor, color: sigColor }}
                >
                  {f.signal}
                </span>
                <span className="text-[9px] text-muted-foreground tabular-nums w-10 text-right">
                  {f.score.toFixed(1)}
                </span>
              </div>
              <div className="mt-1 flex gap-3 text-[9px] text-muted-foreground">
                <span>5d {fmtPct(f.ret_5d)}</span>
                <span>20d {fmtPct(f.ret_20d)}</span>
                <span>RS {fmtPct(f.rs_vs_spy)}</span>
                <span>RSI {f.rsi14 ?? "—"}</span>
                <span>VOL× {f.vol_thrust?.toFixed(2) ?? "—"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}
