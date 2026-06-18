// Next Big Movers — small/mid/microcap anomaly scanner.
// Public-data-only proxies for: abnormal volume, sentiment acceleration (via
// short-window return acceleration), institutional accumulation (vol thrust on
// up days), social/momentum velocity, breakout structure.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getHistory, getQuotes, type Quote } from "@/lib/yahoo";
import {
  extractCloses, extractVolumes, logReturns, mean, rsi, sma, stdev,
} from "@/lib/indicators";
import { MICRO_SMALL_MID } from "@/lib/universes";

type Mover = {
  rank: number;
  symbol: string;
  name?: string;
  price: number | null;
  change_pct: number;
  confidence: number;        // 0-100
  anomaly_score: number;     // 0-100
  bull_prob: number;         // 0-100
  bear_prob: number;
  vol_estimate_pct: number;  // ann vol %
  timeframe: "1-3D" | "1-2W" | "2-6W";
  catalyst: string;          // short summary
  why: string;               // why AI noticed
  signals: string[];
};

let CACHE: { ts: number; data: any } | null = null;
const TTL = 5 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function compute() {
  const symbols = MICRO_SMALL_MID;
  const quotes = await getQuotes(symbols);
  const qMap = new Map<string, Quote>(quotes.map((q) => [q.symbol, q]));

  const CONC = 10;
  const deadline = Date.now() + 9_000;
  const hist = new Map<string, Awaited<ReturnType<typeof getHistory>>>();
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < symbols.length && Date.now() < deadline) {
      const s = symbols[i++];
      try {
        const bars = await withTimeout(getHistory(s, "6mo", "1d"), 1_800, []);
        if (bars.length) hist.set(s, bars);
      } catch {}
    }
  }));

  const movers: Mover[] = [];
  for (const sym of symbols) {
    const bars = hist.get(sym);
    if (!bars || bars.length < 30) continue;
    const closes = extractCloses(bars);
    const vols = extractVolumes(bars);
    if (closes.length < 30 || vols.length < 30) continue;
    const last = closes[closes.length - 1];

    const ret1 = closes.length > 2 ? (last / closes[closes.length - 2] - 1) * 100 : 0;
    const ret5 = closes.length > 6 ? (last / closes[closes.length - 6] - 1) * 100 : 0;
    const ret20 = closes.length > 21 ? (last / closes[closes.length - 21] - 1) * 100 : 0;
    const ret60 = closes.length > 61 ? (last / closes[closes.length - 61] - 1) * 100 : 0;
    const accel = ret5 - (ret20 / 4); // momentum acceleration

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const above20 = sma20 ? (last / sma20 - 1) * 100 : 0;
    const above50 = sma50 ? (last / sma50 - 1) * 100 : 0;

    const rsi14 = rsi(closes, 14) ?? 50;

    const recentVol = vols[vols.length - 1] ?? 0;
    const avg20 = mean(vols.slice(-21, -1)) || 1;
    const volZ = (recentVol - avg20) / (stdev(vols.slice(-21, -1)) || 1);
    const volThrust = recentVol / (avg20 || 1);

    // 52w anchors
    const high52 = Math.max(...closes);
    const low52 = Math.min(...closes);
    const from52H = (last / high52 - 1) * 100;
    const from52L = (last / low52 - 1) * 100;

    // Vol-of-vol & realized vol
    const r60 = logReturns(closes.slice(-60));
    const annVol = stdev(r60) * Math.sqrt(252) * 100;
    const r20 = logReturns(closes.slice(-20));
    const recentRV = stdev(r20) * Math.sqrt(252) * 100;
    const compression = recentRV && annVol ? recentRV / annVol : 1;

    // Anomaly composite — volume thrust + acceleration + RV regime + breakout structure
    const anomaly = clamp(
      Math.abs(volZ) * 12 +
      Math.abs(accel) * 1.5 +
      (Math.abs(from52H) < 4 ? 25 : 0) +
      (compression > 1.4 ? 15 : 0),
      0, 100,
    );

    // Bull/bear probability proxy
    let bull = 50 + accel * 1.2 + above50 * 0.6 + (rsi14 - 50) * 0.5 + (volThrust > 1.3 && ret1 > 0 ? 8 : 0);
    if (from52H > -3) bull += 6;
    bull = clamp(bull, 5, 95);
    const bear = 100 - bull;

    // Confidence — how strong/clean the signal is
    const cleanliness = (Math.abs(volZ) > 1 ? 1 : 0) + (Math.abs(accel) > 3 ? 1 : 0) +
      (above50 !== 0 ? 1 : 0) + (compression > 1.2 || compression < 0.8 ? 1 : 0);
    const confidence = clamp(35 + cleanliness * 12 + (anomaly / 5), 20, 95);

    const signals: string[] = [];
    if (volZ > 1.5) signals.push("ABNORMAL_VOLUME");
    if (accel > 3) signals.push("MOMENTUM_ACCEL");
    if (accel < -3) signals.push("MOMENTUM_BREAKDOWN");
    if (above50 > 5 && ret20 > 5) signals.push("TREND_THRUST");
    if (Math.abs(from52H) < 3) signals.push("52W_HIGH_TEST");
    if (Math.abs(from52L) < 5) signals.push("52W_LOW_TEST");
    if (compression > 1.4) signals.push("VOL_EXPANSION");
    if (compression < 0.7) signals.push("VOL_COMPRESSION_COIL");
    if (rsi14 > 75) signals.push("OVERBOUGHT");
    if (rsi14 < 25) signals.push("OVERSOLD");
    if (volThrust > 2 && ret1 > 2) signals.push("PUBLIC_VOLUME_ACCUMULATION");

    const timeframe: Mover["timeframe"] =
      signals.includes("VOL_COMPRESSION_COIL") ? "2-6W" :
      signals.includes("ABNORMAL_VOLUME") || signals.includes("MOMENTUM_ACCEL") ? "1-3D" :
      "1-2W";

    const catalyst = buildCatalyst(signals, ret5, ret20, volZ, from52H);
    const why = buildWhy(signals, anomaly, accel, volZ);

    const q = qMap.get(sym);
    movers.push({
      rank: 0,
      symbol: sym,
      name: q?.shortName ?? q?.longName,
      price: q?.regularMarketPrice ?? last,
      change_pct: q?.regularMarketChangePercent ?? ret1,
      confidence: Math.round(confidence),
      anomaly_score: Math.round(anomaly),
      bull_prob: Math.round(bull),
      bear_prob: Math.round(bear),
      vol_estimate_pct: Math.round(annVol),
      timeframe,
      catalyst,
      why,
      signals,
    });
  }

  movers.sort((a, b) => (b.anomaly_score + b.confidence) - (a.anomaly_score + a.confidence));
  const top = movers.slice(0, 20).map((m, i) => ({ ...m, rank: i + 1 }));
  return { generated_at: new Date().toISOString(), movers: top, universe_size: symbols.length };
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function buildCatalyst(s: string[], r5: number, r20: number, vz: number, fH: number): string {
  if (s.includes("PUBLIC_VOLUME_ACCUMULATION")) return `Public volume thrust on an up move (vol z=${vz.toFixed(1)}σ); accumulation proxy, not dark-pool proof.`;
  if (s.includes("52W_HIGH_TEST")) return `Pressing 52w high; bull-flag continuation setup if volume confirms.`;
  if (s.includes("VOL_COMPRESSION_COIL")) return `Bollinger compression — energy stored, awaiting directional break.`;
  if (s.includes("MOMENTUM_ACCEL")) return `5d return ${r5.toFixed(1)}% running hot vs 20d ${r20.toFixed(1)}% — trend acceleration.`;
  if (s.includes("OVERSOLD") && r20 > -10) return `Oversold mean-reversion with intact trend structure.`;
  if (s.includes("VOL_EXPANSION")) return `Realized volatility expanding — regime shift in progress.`;
  return `Anomaly cluster: ${s.slice(0, 2).join(", ") || "mixed signal"}.`;
}
function buildWhy(s: string[], a: number, ac: number, vz: number): string {
  const parts: string[] = [];
  parts.push(`anomaly=${a}`);
  if (Math.abs(vz) > 1) parts.push(`vol z=${vz.toFixed(1)}σ`);
  if (Math.abs(ac) > 1) parts.push(`accel=${ac.toFixed(1)}`);
  if (s.length) parts.push(s[0].toLowerCase());
  return parts.join(" · ");
}

export async function getNextBigCached() {
  if (CACHE && Date.now() - CACHE.ts < TTL) return CACHE.data;
  const data = await compute();
  CACHE = { ts: Date.now(), data };
  return data;
}

export const Route = createFileRoute("/api/next-big")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const data = await getNextBigCached();
          return Response.json(data, { headers: { "cache-control": "public, max-age=120" } });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
