// Pure technical-indicator math. All inputs are arrays of closes (or OHLC bars).
// Functions tolerate short series and return null when not computable.

export type Bar = { t: number; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null };

export const last = <T,>(a: T[]): T | null => (a.length ? a[a.length - 1] : null);
const clean = (a: (number | null | undefined)[]): number[] =>
  a.filter((x): x is number => typeof x === "number" && Number.isFinite(x));

export function logReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  }
  return r;
}

export function mean(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export function stdev(a: number[], sample = true): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - (sample ? 1 : 0));
  return Math.sqrt(v);
}

export function annualizedVol(closes: number[], periods = 252): number | null {
  const r = logReturns(closes);
  if (r.length < 5) return null;
  return stdev(r) * Math.sqrt(periods) * 100;
}

export function downsideDeviation(closes: number[], periods = 252, mar = 0): number | null {
  const r = logReturns(closes);
  if (r.length < 5) return null;
  const neg = r.map((x) => Math.min(0, x - mar));
  const v = neg.reduce((s, x) => s + x * x, 0) / neg.length;
  return Math.sqrt(v) * Math.sqrt(periods) * 100;
}

export function maxDrawdown(closes: number[]): { dd_pct: number; peak_idx: number; trough_idx: number; duration: number } | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let peakIdx = 0;
  let troughIdx = 0;
  let maxDD = 0;
  let resPeak = 0;
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] > peak) {
      peak = closes[i];
      peakIdx = i;
    }
    const dd = (closes[i] - peak) / peak;
    if (dd < maxDD) {
      maxDD = dd;
      troughIdx = i;
      resPeak = peakIdx;
    }
  }
  return { dd_pct: maxDD * 100, peak_idx: resPeak, trough_idx: troughIdx, duration: troughIdx - resPeak };
}

export function sharpe(closes: number[], rfAnnualPct = 4.3, periods = 252): number | null {
  const r = logReturns(closes);
  if (r.length < 10) return null;
  const rfPer = Math.log(1 + rfAnnualPct / 100) / periods;
  const excess = r.map((x) => x - rfPer);
  const sd = stdev(excess);
  if (sd === 0) return null;
  return (mean(excess) / sd) * Math.sqrt(periods);
}

export function sortino(closes: number[], rfAnnualPct = 4.3, periods = 252): number | null {
  const r = logReturns(closes);
  if (r.length < 10) return null;
  const rfPer = Math.log(1 + rfAnnualPct / 100) / periods;
  const excess = r.map((x) => x - rfPer);
  const neg = excess.filter((x) => x < 0);
  if (!neg.length) return null;
  const dd = Math.sqrt(neg.reduce((s, x) => s + x * x, 0) / neg.length);
  if (dd === 0) return null;
  return (mean(excess) / dd) * Math.sqrt(periods);
}

export function calmar(closes: number[], periods = 252): number | null {
  if (closes.length < 30) return null;
  const dd = maxDrawdown(closes);
  if (!dd || dd.dd_pct === 0) return null;
  const years = closes.length / periods;
  const cagr = (Math.pow(closes[closes.length - 1] / closes[0], 1 / years) - 1) * 100;
  return cagr / Math.abs(dd.dd_pct);
}

export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return mean(closes.slice(-period));
}

export function ema(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let e = mean(closes.slice(0, period));
  for (let i = period; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return e;
}

function emaSeries(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  if (closes.length < period) return out;
  let e = mean(closes.slice(0, period));
  out.push(e);
  for (let i = period; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export function macd(closes: number[]): { macd: number; signal: number; hist: number } | null {
  if (closes.length < 35) return null;
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  // align
  const off = e12.length - e26.length;
  const macdLine: number[] = [];
  for (let i = 0; i < e26.length; i++) macdLine.push(e12[i + off] - e26[i]);
  if (macdLine.length < 9) return null;
  const sig = emaSeries(macdLine, 9);
  const m = macdLine[macdLine.length - 1];
  const s = sig[sig.length - 1];
  return { macd: m, signal: s, hist: m - s };
}

export function bollinger(closes: number[], period = 20, mult = 2): { mid: number; upper: number; lower: number; bandwidth: number; pctB: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const m = mean(slice);
  const sd = stdev(slice, false);
  const upper = m + mult * sd;
  const lower = m - mult * sd;
  const price = closes[closes.length - 1];
  return {
    mid: m,
    upper,
    lower,
    bandwidth: ((upper - lower) / m) * 100,
    pctB: (price - lower) / (upper - lower),
  };
}

export function atr(bars: Bar[], period = 14): number | null {
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    if (h == null || l == null || pc == null) continue;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  return mean(trs.slice(-period));
}

export function roc(closes: number[], period: number): number | null {
  if (closes.length <= period) return null;
  const a = closes[closes.length - 1 - period];
  const b = closes[closes.length - 1];
  if (!a) return null;
  return (b / a - 1) * 100;
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const aa = a.slice(-n), bb = b.slice(-n);
  const ma = mean(aa), mb = mean(bb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = aa[i] - ma, y = bb[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? null : num / denom;
}

export function percentile(value: number, series: number[]): number {
  const arr = clean(series).slice().sort((a, b) => a - b);
  if (!arr.length) return 0;
  let count = 0;
  for (const v of arr) if (v <= value) count++;
  return (count / arr.length) * 100;
}

export function extractCloses(bars: Bar[]): number[] {
  return clean(bars.map((b) => b.c));
}

export function extractVolumes(bars: Bar[]): number[] {
  return clean(bars.map((b) => b.v));
}
