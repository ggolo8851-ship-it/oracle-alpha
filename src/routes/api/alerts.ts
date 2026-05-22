// Smart Alerts — derived from scanner + macro snapshot. Public data only.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getNextBigCached } from "./next-big";
import { getNewsCached } from "./news";
import { getMarketSnapshot } from "@/lib/yahoo";

type Alert = {
  id: string;
  kind: "VOLUME" | "VOLATILITY" | "SENTIMENT" | "MACRO" | "BREAKOUT" | "BREAKDOWN" | "NEWS";
  severity: "INFO" | "WATCH" | "HIGH" | "CRITICAL";
  symbol?: string;
  title: string;
  detail: string;
  ts: string;
};

async function compute() {
  const [next, news, snap] = await Promise.all([
    getNextBigCached().catch(() => ({ movers: [] })),
    getNewsCached().catch(() => ({ items: [] })),
    getMarketSnapshot().catch(() => []),
  ]);
  const out: Alert[] = [];

  for (const m of (next.movers ?? [])) {
    if (m.signals.includes("ABNORMAL_VOLUME")) {
      out.push({
        id: `vol-${m.symbol}`, kind: "VOLUME", severity: m.anomaly_score > 60 ? "HIGH" : "WATCH",
        symbol: m.symbol, title: `Abnormal volume in ${m.symbol}`,
        detail: `${m.catalyst} · anomaly=${m.anomaly_score}`, ts: new Date().toISOString(),
      });
    }
    if (m.signals.includes("VOL_COMPRESSION_COIL")) {
      out.push({
        id: `coil-${m.symbol}`, kind: "VOLATILITY", severity: "WATCH",
        symbol: m.symbol, title: `${m.symbol} coiled — pending break`,
        detail: m.catalyst, ts: new Date().toISOString(),
      });
    }
    if (m.signals.includes("TREND_THRUST") || m.signals.includes("52W_HIGH_TEST")) {
      out.push({
        id: `bo-${m.symbol}`, kind: "BREAKOUT", severity: "WATCH",
        symbol: m.symbol, title: `${m.symbol} breakout setup`,
        detail: m.catalyst, ts: new Date().toISOString(),
      });
    }
    if (m.signals.includes("MOMENTUM_BREAKDOWN")) {
      out.push({
        id: `bd-${m.symbol}`, kind: "BREAKDOWN", severity: "WATCH",
        symbol: m.symbol, title: `${m.symbol} momentum breakdown`,
        detail: m.catalyst, ts: new Date().toISOString(),
      });
    }
  }

  // Macro alerts
  const byId: Record<string, any> = Object.fromEntries(snap.map((q: any) => [q.symbol, q]));
  const vix = byId["^VIX"]?.regularMarketPrice;
  if (vix != null) {
    if (vix > 28) out.push({ id: "vix-spike", kind: "VOLATILITY", severity: "CRITICAL", title: `VIX at ${vix.toFixed(1)} — risk-off`, detail: "Vol regime shift; expect dispersion, gap risk, liquidity gaps.", ts: new Date().toISOString() });
    else if (vix > 22) out.push({ id: "vix-elev", kind: "VOLATILITY", severity: "HIGH", title: `VIX elevated ${vix.toFixed(1)}`, detail: "Hedging demand rising; momentum unstable.", ts: new Date().toISOString() });
  }
  const tnx = byId["^TNX"]?.regularMarketPrice;
  if (tnx != null && tnx > 4.7) out.push({ id: "rates-up", kind: "MACRO", severity: "HIGH", title: `10Y at ${tnx.toFixed(2)}% — duration pressure`, detail: "Long-duration/tech sensitivity; watch credit spreads.", ts: new Date().toISOString() });

  // News-driven alerts
  for (const n of (news.items ?? []).slice(0, 5)) {
    if (n.importance >= 75) {
      out.push({
        id: `news-${n.id}`, kind: "NEWS",
        severity: n.importance >= 88 ? "CRITICAL" : "HIGH",
        title: n.title,
        detail: `${n.publisher} · ${n.impact} · sectors: ${n.sectors.join(", ") || "—"}`,
        ts: new Date(n.ts * 1000).toISOString(),
      });
    }
  }

  return { generated_at: new Date().toISOString(), alerts: out.slice(0, 30) };
}

export const Route = createFileRoute("/api/alerts")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await compute(), { headers: { "cache-control": "public, max-age=60" } });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
