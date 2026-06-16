// Unofficial Yahoo Finance helpers. Public endpoints, delayed quotes.
// Hardened with in-memory TTL cache, host fallback, and retry/backoff to
// survive Yahoo's frequent 429 rate-limit responses.

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

export type Quote = {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
  currency?: string;
  exchange?: string;
};

// ─── tiny TTL cache (process-scoped) ──────────────────────────────────────
type CacheEntry<T> = { v: T; exp: number };
const _cache = new Map<string, CacheEntry<any>>();
function cacheGet<T>(k: string): T | undefined {
  const e = _cache.get(k);
  if (!e) return undefined;
  if (Date.now() > e.exp) { _cache.delete(k); return undefined; }
  return e.v as T;
}
function cacheSet<T>(k: string, v: T, ttlMs: number) {
  _cache.set(k, { v, exp: Date.now() + ttlMs });
  // bound cache size
  if (_cache.size > 500) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch with host fallback (query1 → query2) and exponential backoff on 429/5xx.
async function yfetch(path: string, opts: { tries?: number } = {}): Promise<Response | null> {
  const tries = opts.tries ?? 3;
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  let lastStatus = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    const host = hosts[attempt % hosts.length];
    try {
      const r = await fetch(host + path, { headers: UA });
      if (r.ok) return r;
      lastStatus = r.status;
      if (r.status !== 429 && r.status < 500) return r; // don't retry 4xx (except 429)
    } catch {
      // network — retry
    }
    // backoff: 400ms, 900ms, 1600ms (+ jitter)
    await sleep(400 * (attempt + 1) ** 2 + Math.floor(Math.random() * 200));
  }
  if (lastStatus) return null;
  return null;
}

async function fetchChartMeta(sym: string): Promise<Quote | null> {
  const ck = `meta:${sym}`;
  const hit = cacheGet<Quote | null>(ck);
  if (hit !== undefined) return hit;
  try {
    const path = `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
    const r = await yfetch(path);
    if (!r || !r.ok) { cacheSet(ck, null, 30_000); return null; }
    const j = (await r.json()) as any;
    const res = j?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta) { cacheSet(ck, null, 30_000); return null; }
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    const change = price != null && prev != null ? price - prev : undefined;
    const changePct = change != null && prev ? (change / prev) * 100 : undefined;
    const q: Quote = {
      symbol: meta.symbol ?? sym,
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePct,
      regularMarketVolume: meta.regularMarketVolume,
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      currency: meta.currency,
      exchange: meta.exchangeName,
    };
    cacheSet(ck, q, 60_000); // 60s quote cache
    return q;
  } catch {
    cacheSet(ck, null, 30_000);
    return null;
  }
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const out: Quote[] = [];
  // Lower concurrency to reduce 429 pressure on Yahoo.
  const CONC = 4;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONC, symbols.length) }, async () => {
      while (i < symbols.length) {
        const idx = i++;
        const q = await fetchChartMeta(symbols[idx]);
        if (q) out.push(q);
      }
    }),
  );
  return out;
}

export type Bar = { t: number; o: number|null; h: number|null; l: number|null; c: number|null; v: number|null };

export async function getHistory(
  symbol: string,
  range = "6mo",
  interval = "1d",
): Promise<Bar[]> {
  const ck = `hist:${symbol}:${range}:${interval}`;
  const hit = cacheGet<Bar[]>(ck);
  if (hit !== undefined) return hit;
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const r = await yfetch(path, { tries: 4 });
  if (!r || !r.ok) {
    // last-chance: serve a stale cached entry if any exists under any range
    for (const [k, e] of _cache) {
      if (k.startsWith(`hist:${symbol}:`)) return e.v as Bar[];
    }
    throw new Error(`history ${symbol}: ${r?.status ?? "network"}`);
  }
  const j = (await r.json()) as any;
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error("no data");
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = ts.map((t, i) => ({
    t,
    o: q.open?.[i] ?? null,
    h: q.high?.[i] ?? null,
    l: q.low?.[i] ?? null,
    c: q.close?.[i] ?? null,
    v: q.volume?.[i] ?? null,
  }));
  // History changes slowly; cache 10 min for daily, 2 min for intraday.
  const ttl = interval.endsWith("m") || interval === "1h" ? 120_000 : 600_000;
  cacheSet(ck, bars, ttl);
  return bars;
}

export async function searchSymbols(query: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query,
  )}&quotesCount=10&newsCount=4`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`search: ${r.status}`);
  const j = (await r.json()) as any;
  return {
    quotes: (j.quotes ?? []).map((q: any) => ({
      symbol: q.symbol,
      shortname: q.shortname ?? q.longname,
      exchange: q.exchDisp,
      type: q.quoteType,
    })),
    news: (j.news ?? []).map((n: any) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      providerPublishTime: n.providerPublishTime,
    })),
  };
}

export async function getMarketSnapshot() {
  const tickers = [
    "^GSPC", "^IXIC", "^DJI", "^RUT",
    "^VIX", "^TNX", "DX-Y.NYB",
    "CL=F", "GC=F",
    "BTC-USD", "ETH-USD",
  ];
  return getQuotes(tickers);
}
