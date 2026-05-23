// Background poll for watched symbols. Fires sonner toasts on:
//  • intraday move > user threshold
//  • price within 2% of 52w high or low
//  • volume z-score > 2 vs 20d
// Polls every 45s. Mounts once at app root.
import { useEffect } from "react";
import { toast } from "sonner";
import { listWatch, shouldFire } from "@/lib/watchlist";

export function WatchAlerts({ onPick }: { onPick: (s: string) => void }) {
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const items = listWatch();
      if (!items.length) return;
      try {
        const r = await fetch(`/api/snapshot?symbols=${items.map(i => i.symbol).join(",")}`);
        if (!r.ok) return;
        const j = await r.json();
        const quotes = (j.quotes ?? j) as any[];
        if (!alive) return;
        for (const q of quotes) {
          const sym = q?.symbol; if (!sym) continue;
          const it = items.find(i => i.symbol === sym); if (!it) continue;
          const chg = q.regularMarketChangePercent ?? 0;
          const price = q.regularMarketPrice;
          const hi = q.fiftyTwoWeekHigh, lo = q.fiftyTwoWeekLow;
          const vol = q.regularMarketVolume, avg = q.averageVolume;

          if (Math.abs(chg) >= it.thresholdPct && shouldFire(sym, `move:${chg > 0 ? "up" : "dn"}`)) {
            const dir = chg > 0 ? "▲" : "▼";
            (chg > 0 ? toast.success : toast.error)(`${dir} ${sym} ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`, {
              description: `Threshold ${it.thresholdPct}% hit at $${price?.toFixed(2)}`,
              action: { label: "OPEN", onClick: () => onPick(sym) },
            });
          }
          if (it.near52w && price != null) {
            if (hi && price >= hi * 0.98 && shouldFire(sym, "near52h")) {
              toast(`${sym} approaching 52w HIGH`, {
                description: `$${price.toFixed(2)} vs $${hi.toFixed(2)} (within 2%)`,
                action: { label: "OPEN", onClick: () => onPick(sym) },
              });
            }
            if (lo && price <= lo * 1.02 && shouldFire(sym, "near52l")) {
              toast(`${sym} approaching 52w LOW`, {
                description: `$${price.toFixed(2)} vs $${lo.toFixed(2)} (within 2%)`,
                action: { label: "OPEN", onClick: () => onPick(sym) },
              });
            }
          }
          if (it.volSpike && vol && avg && vol > avg * 2.5 && shouldFire(sym, "volspike")) {
            toast.warning(`${sym} volume spike`, {
              description: `${(vol / avg).toFixed(1)}× 20d avg volume`,
              action: { label: "OPEN", onClick: () => onPick(sym) },
            });
          }
        }
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 45_000);
    return () => { alive = false; clearInterval(id); };
  }, [onPick]);
  return null;
}
