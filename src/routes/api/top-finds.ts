// Top finds scanner: scores a curated universe and returns ranked picks.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getHistory, getQuotes, type Quote } from "@/lib/yahoo";
import { extractCloses, extractVolumes, logReturns, mean, rsi, sma, stdev } from "@/lib/indicators";

const UNIVERSE = [
  // Mega caps & megatrends
  "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","AMD","NFLX",
  "ADBE","CRM","ORCL","COST","WMT","HD","JPM","BAC","V","MA",
  // AI / semis / cloud
  "PLTR","SMCI","ARM","MU","TSM","ASML","LRCX","KLAC","ANET","SNOW","DELL","MRVL",
  // Energy / commodities
  "XOM","CVX","OXY","SLB","FCX","NEM",
  // Biotech & health megacaps
  "LLY","UNH","NVO","ABBV",
  // Crypto proxies & high-beta
  "COIN","MSTR","HOOD","RBLX","SHOP","UBER","ABNB",
  // ETFs for relative-strength anchor
  "SPY","QQQ","IWM","XLK","XLE","XLF","ARKK","SMH"
];

const BENCH = "SPY";

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

let CACHE: { ts: number; data: any } | null = null;
const TTL_MS = 5 * 60 * 1000;

async function compute(): Promise<{ generated_at: string; finds: Find[]; universe_size: number }> {
  const symbols = Array.from(new Set([...UNIVERSE, BENCH]));
  const quotes = await getQuotes(symbols);
  const qMap = new Map<string, Quote>(quotes.map((q) => [q.symbol, q]));

  // Pull 6mo history for each (concurrency-limited).
  const CONC = 6;
  const hist = new Map<string, Awaited<ReturnType<typeof getHistory>>>();
  let i = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < symbols.length) {
        const sym = symbols[i++];
        try {
          hist.set(sym, await getHistory(sym, "6mo", "1d"));
        } catch {}
      }
    }),
  );

  const benchBars = hist.get(BENCH) ?? [];
  const benchCloses = extractCloses(benchBars);
  const benchRet20 = benchCloses.length > 21
    ? benchCloses[benchCloses.length - 1] / benchCloses[benchCloses.length - 21] - 1
    : 0;

  const scored: Find[] = [];

  for (const sym of UNIVERSE) {
    const bars = hist.get(sym);
    if (!bars || bars.length < 30) continue;
    const closes = extractCloses(bars);
    const vols = extractVolumes(bars);
    if (closes.length < 30) continue;
    const last = closes[closes.length - 1];

    const ret5 = closes.length > 6 ? (last / closes[closes.length - 6] - 1) * 100 : null;
    const ret20 = closes.length > 21 ? (last / closes[closes.length - 21] - 1) * 100 : null;
    const ret60 = closes.length > 61 ? (last / closes[closes.length - 61] - 1) * 100 : null;

    const sma50 = sma(closes, 50);
    const sma200 = sma(closes.slice(-Math.min(closes.length, 200)), Math.min(200, Math.max(50, closes.length - 1)));
    const above50 = sma50 ? (last / sma50 - 1) * 100 : 0;
    const above200 = sma200 ? (last / sma200 - 1) * 100 : 0;

    const rsi14 = rsi(closes, 14);

    // Relative strength: 20d return vs bench
    const rsVsSpy = ret20 != null ? ret20 - benchRet20 * 100 : null;

    // Volume thrust: today vs 20d avg
    const recentVol = vols[vols.length - 1] ?? 0;
    const avgVol20 = vols.length > 20 ? mean(vols.slice(-21, -1)) : 0;
    const volThrust = avgVol20 > 0 ? recentVol / avgVol20 : null;

    // Vol-adjusted quality
    const r = logReturns(closes.slice(-60));
    const sd = stdev(r);
    const annR = mean(r) * 252;
    const annVol = sd * Math.sqrt(252);
    const qualSharpe = annVol > 0 ? annR / annVol : 0;

    // Composite score (0-100ish, clamped)
    const momentum = clamp((ret5 ?? 0) * 2 + (ret20 ?? 0) * 1.5, -60, 60);
    const trend = clamp(above50 * 1.5 + above200, -60, 60);
    const rsScore = clamp((rsVsSpy ?? 0) * 1.5, -40, 40);
    const volScore = clamp(((volThrust ?? 1) - 1) * 30, -25, 35);
    const qualityScore = clamp(qualSharpe * 15, -20, 20);

    const score =
      0.3 * momentum + 0.25 * trend + 0.2 * rsScore + 0.15 * volScore + 0.1 * qualityScore + 50;

    // Signal classification
    let signal = "MOMENTUM";
    if (above50 > 5 && above200 > 0 && (ret20 ?? 0) > 10 && (rsi14 ?? 0) < 75) signal = "BREAKOUT";
    else if ((ret5 ?? 0) > 4 && (volThrust ?? 0) > 1.5) signal = "VOLUME_THRUST";
    else if ((rsi14 ?? 50) < 35 && (ret20 ?? 0) > -5 && above200 > -5) signal = "REVERSAL";
    else if (above200 > 5 && Math.abs(ret5 ?? 0) < 2 && (volThrust ?? 0) > 0.9) signal = "ACCUMULATION";
    else if ((ret20 ?? 0) > 5 && above50 > 0) signal = "MOMENTUM";
    else if ((rsi14 ?? 50) > 75) signal = "OVEREXTENDED";

    const q = qMap.get(sym);
    scored.push({
      rank: 0,
      symbol: sym,
      name: q?.shortName ?? q?.longName,
      price: q?.regularMarketPrice ?? last,
      change_pct: q?.regularMarketChangePercent ?? 0,
      score: Math.round(score * 10) / 10,
      signal,
      rs_vs_spy: rsVsSpy != null ? Math.round(rsVsSpy * 10) / 10 : null,
      rsi14: rsi14 != null ? Math.round(rsi14) : null,
      ret_5d: ret5 != null ? Math.round(ret5 * 100) / 100 : null,
      ret_20d: ret20 != null ? Math.round(ret20 * 100) / 100 : null,
      vol_thrust: volThrust != null ? Math.round(volThrust * 100) / 100 : null,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 10).map((f, idx) => ({ ...f, rank: idx + 1 }));

  return { generated_at: new Date().toISOString(), finds: top, universe_size: UNIVERSE.length };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function getTopFindsCached() {
  if (CACHE && Date.now() - CACHE.ts < TTL_MS) return CACHE.data;
  const data = await compute();
  CACHE = { ts: Date.now(), data };
  return data;
}

export const Route = createFileRoute("/api/top-finds")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const data = await getTopFindsCached();
          return Response.json(data, {
            headers: { "cache-control": "public, max-age=120" },
          });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
