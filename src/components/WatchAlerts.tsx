// Background poll for watched symbols. Fires sonner toasts on:
//  • intraday move > user threshold
//  • price within 2% of 52w high or low
//  • volume z-score > 2 vs 20d
//  • tracked prediction hitting its target / stop / expiry
// Polls every 45s. Mounts once at app root.
import { useEffect } from "react";
import { toast } from "sonner";
import {
  listWatch, shouldFire, listPredictions, predTarget, predStop, resolvePrediction,
} from "@/lib/watchlist";

export function WatchAlerts({ onPick }: { onPick: (s: string) => void }) {
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const items = listWatch();
      const preds = listPredictions().filter(p => p.status === "live");
      const symbols = Array.from(new Set([...items.map(i => i.symbol), ...preds.map(p => p.symbol)]));
      if (!symbols.length) return;
      try {
        const r = await fetch(`/api/snapshot?symbols=${symbols.join(",")}`);
        if (!r.ok) return;
        const j = await r.json();
        const quotes = (j.quotes ?? j) as any[];
        if (!alive) return;

        // ── prediction resolution ──
        const priceBySym = new Map<string, number>();
        for (const q of quotes) if (q?.symbol && q.regularMarketPrice != null) priceBySym.set(q.symbol, q.regularMarketPrice);
        for (const p of preds) {
          const px = priceBySym.get(p.symbol);
          if (px == null) continue;
          const tgt = predTarget(p, px);
          const stp = predStop(p, px);
          const ageH = (Date.now() - p.createdAt) / 3_600_000;
          if (tgt != null && px >= tgt) {
            resolvePrediction(p.id, "hit", px);
            toast.success(`✅ CALL HIT · ${p.symbol}`, {
              description: `Target $${tgt.toFixed(2)} reached at $${px.toFixed(2)}${p.note ? ` — ${p.note}` : ""}`,
              action: { label: "OPEN", onClick: () => onPick(p.symbol) },
              duration: 12_000,
            });
          } else if (stp != null && px <= stp) {
            resolvePrediction(p.id, "stopped", px);
            toast.error(`✕ CALL INVALIDATED · ${p.symbol}`, {
              description: `Stop $${stp.toFixed(2)} breached at $${px.toFixed(2)}`,
              action: { label: "OPEN", onClick: () => onPick(p.symbol) },
              duration: 12_000,
            });
          } else if (ageH >= p.horizonHours) {
            resolvePrediction(p.id, "expired", px);
            toast(`⧗ CALL EXPIRED · ${p.symbol}`, {
              description: `Horizon ${p.horizonHours}h elapsed at $${px.toFixed(2)}${tgt != null ? ` (target $${tgt.toFixed(2)})` : ""}`,
            });
          } else if (tgt != null && px >= p.spot! + (tgt - p.spot!) * 0.75 && shouldFire(p.symbol, `pred75:${p.id}`)) {
            toast(`${p.symbol} 75% to target`, {
              description: `$${px.toFixed(2)} → target $${tgt.toFixed(2)}`,
              action: { label: "OPEN", onClick: () => onPick(p.symbol) },
            });
          }
        }


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
