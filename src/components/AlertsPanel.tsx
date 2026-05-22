import { useEffect, useState } from "react";

type Alert = {
  id: string; kind: string; severity: "INFO"|"WATCH"|"HIGH"|"CRITICAL";
  symbol?: string; title: string; detail: string; ts: string;
};

const SEV_COLOR: Record<string, string> = {
  INFO: "text-muted-foreground", WATCH: "text-warn", HIGH: "text-warn", CRITICAL: "text-bear",
};

export function AlertsPanel({ onPick }: { onPick: (s: string) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch("/api/alerts");
      const j = await r.json();
      if (alive) { setAlerts(j.alerts ?? []); setLoading(false); }
    };
    load();
    const id = setInterval(load, 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="font-mono">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ SMART ALERTS</div>
          <div className="text-lg tracking-widest text-primary">REAL-TIME ANOMALY FEED</div>
        </div>
        <div className="text-[10px] text-muted-foreground">{loading ? "…" : `${alerts.length} active`}</div>
      </div>
      <div className="grid gap-2">
        {alerts.map(a => (
          <div key={a.id} className="bg-card border border-border p-2 text-xs flex gap-3">
            <div className={`text-[10px] w-16 tracking-widest ${SEV_COLOR[a.severity]}`}>● {a.severity}</div>
            <div className="flex-1 min-w-0">
              <div className="text-foreground">{a.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{a.detail}</div>
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0 text-right">
              <div>{a.kind}</div>
              {a.symbol && <button onClick={() => onPick(a.symbol!)} className="text-primary hover:underline">{a.symbol}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
