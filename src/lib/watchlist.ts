// Watchlist (the "bag") — persisted in localStorage. Each item stores
// thresholds used by the live alert engine.

export type WatchItem = {
  symbol: string;
  addedAt: number;
  addedPrice?: number;        // baseline price when added (for % from-entry alerts)
  thresholdPct: number;       // intraday % move that triggers an alert
  near52w: boolean;           // alert when within 2% of 52w high/low
  rsiExtremes: boolean;       // alert when RSI<30 or >70 (computed in simulation)
  volSpike: boolean;          // alert when volume z-score > 2
};

const KEY = "anomaly.watchlist.v1";
const SEEN_KEY = "anomaly.watchlist.seen.v1";

function read(): WatchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function write(items: WatchItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("anomaly:watchlist-change"));
}

export function listWatch(): WatchItem[] { return read(); }
export function isWatched(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return read().some(i => i.symbol === s);
}
export function addWatch(symbol: string, addedPrice?: number): WatchItem {
  const s = symbol.toUpperCase();
  const cur = read();
  const existing = cur.find(i => i.symbol === s);
  if (existing) return existing;
  const item: WatchItem = {
    symbol: s, addedAt: Date.now(), addedPrice,
    thresholdPct: 3, near52w: true, rsiExtremes: true, volSpike: true,
  };
  write([item, ...cur]);
  return item;
}
export function removeWatch(symbol: string) {
  const s = symbol.toUpperCase();
  write(read().filter(i => i.symbol !== s));
}
export function updateWatch(symbol: string, patch: Partial<WatchItem>) {
  const s = symbol.toUpperCase();
  write(read().map(i => (i.symbol === s ? { ...i, ...patch } : i)));
}

// ───────────── Prediction tracking ─────────────
// A prediction pins a target (and optional stop) so the alert engine can tell
// the user whether the call actually came to pass.

export type Prediction = {
  id: string;
  symbol: string;
  createdAt: number;
  spot?: number;          // price at the time the call was made
  targetPrice?: number;   // absolute target
  targetPct?: number;     // or % move target
  stopPct?: number;       // invalidation level (%)
  horizonHours: number;   // how long the call is live
  note?: string;
  status: "live" | "hit" | "stopped" | "expired";
  resolvedAt?: number;
  resolvedPrice?: number;
};

const PRED_KEY = "anomaly.predictions.v1";

function readPreds(): Prediction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRED_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writePreds(p: Prediction[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRED_KEY, JSON.stringify(p.slice(0, 200)));
  window.dispatchEvent(new CustomEvent("anomaly:predictions-change"));
}

export function listPredictions(): Prediction[] { return readPreds(); }

export function addPrediction(p: {
  symbol: string; spot?: number; targetPrice?: number; targetPct?: number;
  stopPct?: number; horizonHours?: number; note?: string;
}): Prediction {
  const pred: Prediction = {
    id: `${p.symbol.toUpperCase()}-${Date.now()}`,
    symbol: p.symbol.toUpperCase(),
    createdAt: Date.now(),
    spot: p.spot,
    targetPrice: p.targetPrice,
    targetPct: p.targetPct,
    stopPct: p.stopPct,
    horizonHours: p.horizonHours ?? 24,
    note: p.note,
    status: "live",
  };
  writePreds([pred, ...readPreds()]);
  return pred;
}

export function resolvePrediction(id: string, status: Prediction["status"], price?: number) {
  writePreds(readPreds().map(p => p.id === id ? { ...p, status, resolvedAt: Date.now(), resolvedPrice: price } : p));
}

export function removePrediction(id: string) {
  writePreds(readPreds().filter(p => p.id !== id));
}

/** Absolute target price for a prediction, resolving % targets against a baseline. */
export function predTarget(p: Prediction, baseline?: number): number | null {
  if (p.targetPrice != null && Number.isFinite(p.targetPrice)) return p.targetPrice;
  const base = p.spot ?? baseline;
  if (base != null && p.targetPct != null) return base * (1 + p.targetPct / 100);
  return null;
}
export function predStop(p: Prediction, baseline?: number): number | null {
  const base = p.spot ?? baseline;
  if (base != null && p.stopPct != null) return base * (1 - Math.abs(p.stopPct) / 100);
  return null;
}

// Dedupe alerts per session — one ping per (symbol, key) per hour.
export function shouldFire(symbol: string, key: string, windowMs = 60 * 60 * 1000): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const k = `${symbol}:${key}`;
    const now = Date.now();
    if (map[k] && now - map[k] < windowMs) return false;
    map[k] = now;
    // prune old
    for (const kk of Object.keys(map)) if (now - map[kk] > windowMs * 6) delete map[kk];
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
    return true;
  } catch { return true; }
}
