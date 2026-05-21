// Behavioral-finance composites built on top of indicators + real Yahoo data.
import { getHistory } from "./yahoo";
import {
  correlation,
  extractCloses,
  extractVolumes,
  logReturns,
  percentile,
  rsi,
  sma,
  stdev,
} from "./indicators";

export type MarketRegime = "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";

export function regimeFromScore(s: number): MarketRegime {
  if (s < 20) return "EXTREME_FEAR";
  if (s < 40) return "FEAR";
  if (s < 60) return "NEUTRAL";
  if (s < 80) return "GREED";
  return "EXTREME_GREED";
}

// Macro fear/greed: 0 = extreme fear, 100 = extreme greed.
export async function marketFearGreed() {
  const [spy, vix, vxn, rut, gspc] = await Promise.all([
    getHistory("SPY", "1y", "1d").catch(() => []),
    getHistory("^VIX", "1y", "1d").catch(() => []),
    getHistory("^VXN", "1y", "1d").catch(() => []),
    getHistory("^RUT", "1y", "1d").catch(() => []),
    getHistory("^GSPC", "1y", "1d").catch(() => []),
  ]);

  const spyC = extractCloses(spy);
  const vixC = extractCloses(vix);
  const vxnC = extractCloses(vxn);
  const rutC = extractCloses(rut);
  const gspcC = extractCloses(gspc);

  const components: Record<string, number> = {};

  // 1) VIX percentile inverted (low VIX => greed)
  if (vixC.length > 30) {
    const last = vixC[vixC.length - 1];
    const pct = percentile(last, vixC);
    components.vix_inv = 100 - pct;
  }

  // 2) 125-day momentum
  if (spyC.length > 130) {
    const ret = (spyC[spyC.length - 1] / spyC[spyC.length - 126] - 1) * 100;
    components.momentum_125d = Math.max(0, Math.min(100, 50 + ret * 4));
  }

  // 3) Distance from 200dma
  const sma200 = sma(spyC, 200);
  if (sma200) {
    const dist = (spyC[spyC.length - 1] / sma200 - 1) * 100;
    components.trend_200dma = Math.max(0, Math.min(100, 50 + dist * 5));
  }

  // 4) Put/call proxy via VXN/VIX (tech vol vs broad vol)
  if (vxnC.length && vixC.length) {
    const ratio = vxnC[vxnC.length - 1] / vixC[vixC.length - 1];
    // Lower ratio => less tech panic => greed
    components.vol_dispersion = Math.max(0, Math.min(100, 100 - (ratio - 1) * 200));
  }

  // 5) Breadth proxy via RUT/GSPC change over 20d
  if (rutC.length > 25 && gspcC.length > 25) {
    const rut20 = rutC[rutC.length - 1] / rutC[rutC.length - 21];
    const spx20 = gspcC[gspcC.length - 1] / gspcC[gspcC.length - 21];
    const rs = (rut20 / spx20 - 1) * 100;
    components.breadth_smallcap = Math.max(0, Math.min(100, 50 + rs * 10));
  }

  const vals = Object.values(components);
  const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
  return {
    score: Math.round(score * 10) / 10,
    regime: regimeFromScore(score),
    components: Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ),
    last_updated: new Date().toISOString(),
  };
}

// Ticker-level behavioral read
export async function tickerBehavioral(symbol: string) {
  const bars = await getHistory(symbol, "1y", "1d");
  const closes = extractCloses(bars);
  const vols = extractVolumes(bars);
  if (closes.length < 50) return { error: `insufficient history for ${symbol}` };

  const last = closes[closes.length - 1];
  const high52 = Math.max(...closes);
  const low52 = Math.min(...closes);
  const anchoring_from_high_pct = (last / high52 - 1) * 100;
  const anchoring_from_low_pct = (last / low52 - 1) * 100;

  // Reflexivity: corr of price change vs volume change (20d)
  const priceChg: number[] = [];
  const volChg: number[] = [];
  const n = Math.min(closes.length, vols.length);
  for (let i = Math.max(1, n - 20); i < n; i++) {
    if (vols[i - 1] > 0) {
      priceChg.push(closes[i] / closes[i - 1] - 1);
      volChg.push(vols[i] / vols[i - 1] - 1);
    }
  }
  const reflexivity = correlation(priceChg, volChg);

  // Crowding: vol-compression × RSI extreme × distance from 50dma
  const r = logReturns(closes.slice(-60));
  const realizedVol = stdev(r) * Math.sqrt(252) * 100;
  const rRecent = logReturns(closes.slice(-20));
  const recentVol = stdev(rRecent) * Math.sqrt(252) * 100;
  const compression = recentVol && realizedVol ? recentVol / realizedVol : null;

  const rsi14 = rsi(closes, 14);
  const sma50 = sma(closes, 50);
  const distFrom50 = sma50 ? ((last - sma50) / sma50) * 100 : null;

  // Recency-bias warning
  const trailing = logReturns(closes.slice(-65, -5));
  const last5Ret = closes.length > 6 ? Math.log(closes[closes.length - 1] / closes[closes.length - 6]) : 0;
  const trailingSd = stdev(trailing);
  const recency_z = trailingSd > 0 ? last5Ret / trailingSd : 0;

  const biases: string[] = [];
  if (Math.abs(anchoring_from_high_pct) < 2) biases.push("ANCHORING_TO_52W_HIGH");
  if (Math.abs(anchoring_from_low_pct) < 5) biases.push("ANCHORING_TO_52W_LOW");
  if (rsi14 != null && rsi14 > 70) biases.push("HERDING_OVERBOUGHT");
  if (rsi14 != null && rsi14 < 30) biases.push("CAPITULATION_OVERSOLD");
  if (Math.abs(recency_z) > 2) biases.push("RECENCY_BIAS");
  if (distFrom50 != null && Math.abs(distFrom50) > 15) biases.push("DISPOSITION_EXTENDED");
  if (reflexivity != null && reflexivity > 0.5) biases.push("REFLEXIVE_FOMO_LOOP");
  if (reflexivity != null && reflexivity < -0.5) biases.push("REFLEXIVE_PANIC_LOOP");

  return {
    symbol,
    last,
    anchoring: {
      pct_from_52w_high: round(anchoring_from_high_pct),
      pct_from_52w_low: round(anchoring_from_low_pct),
      high_52w: round(high52),
      low_52w: round(low52),
    },
    reflexivity_20d: reflexivity != null ? round(reflexivity, 3) : null,
    crowding: {
      realized_vol_60d_pct: round(realizedVol),
      recent_vol_20d_pct: round(recentVol),
      compression_ratio: compression != null ? round(compression, 3) : null,
      rsi_14: rsi14 != null ? round(rsi14) : null,
      pct_from_sma50: distFrom50 != null ? round(distFrom50) : null,
    },
    recency: {
      last5d_log_return: round(last5Ret, 4),
      trailing_60d_sd: round(trailingSd, 4),
      z_score: round(recency_z, 2),
      warning: Math.abs(recency_z) > 2,
    },
    named_biases: biases,
  };
}

function round(n: number, d = 2) {
  if (!Number.isFinite(n)) return null as unknown as number;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
