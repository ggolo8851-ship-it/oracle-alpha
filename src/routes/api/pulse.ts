// Global Market Pulse — executive summary panel.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getMarketSnapshot } from "@/lib/yahoo";
import { marketFearGreed } from "@/lib/behavioral";
import { getTopFindsCached } from "./top-finds";
import { getNextBigCached } from "./next-big";

let CACHE: { ts: number; data: any } | null = null;
const TTL = 3 * 60 * 1000;

async function compute() {
  const [snap, fg, top, next] = await Promise.all([
    getMarketSnapshot().catch(() => []),
    marketFearGreed().catch(() => null),
    getTopFindsCached().catch(() => ({ finds: [] })),
    getNextBigCached().catch(() => ({ movers: [] })),
  ]);
  const byId: Record<string, any> = Object.fromEntries(snap.map((q: any) => [q.symbol, q]));
  const vix = byId["^VIX"]?.regularMarketPrice ?? null;
  const tnx = byId["^TNX"]?.regularMarketPrice ?? null;
  const spx = byId["^GSPC"]?.regularMarketChangePercent ?? null;
  const ndx = byId["^IXIC"]?.regularMarketChangePercent ?? null;

  let regime = "NEUTRAL";
  if (vix != null) {
    if (vix > 28) regime = "RISK_OFF";
    else if (vix > 20) regime = "CAUTIOUS";
    else if (vix < 14) regime = "RISK_ON_COMPLACENT";
    else regime = "RISK_ON";
  }

  const liquidity = tnx != null && vix != null
    ? (tnx > 4.7 && vix > 22 ? "TIGHTENING" : tnx < 4 ? "EASING" : "STABLE")
    : "UNKNOWN";

  // top sector tilt from top finds
  const sectorScores: Record<string, number> = {};
  for (const f of (top.finds ?? [])) {
    sectorScores[f.signal] = (sectorScores[f.signal] ?? 0) + f.score;
  }

  return {
    generated_at: new Date().toISOString(),
    snapshot: snap,
    fear_greed: fg,
    risk_regime: regime,
    liquidity_regime: liquidity,
    market_breath: { spx_chg_pct: spx, ndx_chg_pct: ndx, vix, ust10y: tnx },
    top_bullish: (top.finds ?? []).slice(0, 5).map((f: any) => ({ symbol: f.symbol, score: f.score, signal: f.signal })),
    highest_anomalies: (next.movers ?? []).slice(0, 5).map((m: any) => ({ symbol: m.symbol, anomaly_score: m.anomaly_score, signals: m.signals })),
    narrative_dominant:
      regime.startsWith("RISK_ON") ? "Growth/AI momentum, narrative chase"
      : regime === "CAUTIOUS" ? "Defensives bid, vol creeping"
      : regime === "RISK_OFF" ? "De-risking, USD/gold bid"
      : "Mixed crosscurrents",
  };
}

export async function getPulseCached() {
  if (CACHE && Date.now() - CACHE.ts < TTL) return CACHE.data;
  const data = await compute();
  CACHE = { ts: Date.now(), data };
  return data;
}

export const Route = createFileRoute("/api/pulse")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await getPulseCached(), { headers: { "cache-control": "public, max-age=90" } });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
