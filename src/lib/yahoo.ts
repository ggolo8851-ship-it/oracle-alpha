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
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
  marketState?: string;
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

function finiteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function selectCurrentPrice(q: any): number | undefined {
  const state = String(q?.marketState ?? "").toUpperCase();
  if (state.includes("PRE") && finiteNumber(q?.preMarketPrice)) return q.preMarketPrice;
  if (state.includes("POST") && finiteNumber(q?.postMarketPrice)) return q.postMarketPrice;
  if (finiteNumber(q?.regularMarketPrice)) return q.regularMarketPrice;
  if (finiteNumber(q?.postMarketPrice)) return q.postMarketPrice;
  if (finiteNumber(q?.preMarketPrice)) return q.preMarketPrice;
  return undefined;
}

function selectCurrentChangePct(q: any): number | undefined {
  const state = String(q?.marketState ?? "").toUpperCase();
  const pick = state.includes("PRE") ? q?.preMarketChangePercent : state.includes("POST") ? q?.postMarketChangePercent : q?.regularMarketChangePercent;
  return typeof pick === "number" && Number.isFinite(pick) ? pick : q?.regularMarketChangePercent;
}

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

// Primary live-price source: the 1-minute intraday chart with pre/post included.
// This is the freshest public Yahoo surface (v7/finance/quote is now crumb-gated
// and returns 401/429), and it gives us the true last traded tick plus the
// previous close needed for an exact change %.
async function fetchChartMeta(sym: string): Promise<Quote | null> {
  const ck = `meta:${sym}`;
  const hit = cacheGet<Quote | null>(ck);
  if (hit !== undefined) return hit;
  try {
    const path = `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`;
    const r = await yfetch(path);
    if (!r || !r.ok) { console.error("[yahoo] chartMeta http", sym, r?.status); cacheSet(ck, null, 15_000); return null; }
    const j = (await r.json()) as any;
    const res = j?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta) { cacheSet(ck, null, 15_000); return null; }

    // Last non-null 1m close, with its timestamp, so we can prefer whichever of
    // (series tick, meta price) is actually more recent.
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const vols: (number | null)[] = res?.indicators?.quote?.[0]?.volume ?? [];
    let tickPrice: number | undefined;
    let tickTime = 0;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (finiteNumber(closes[i])) { tickPrice = closes[i] as number; tickTime = ts[i] ?? 0; break; }
    }
    const metaPrice = selectCurrentPrice(meta);
    const metaTime = Number(meta.regularMarketTime ?? 0);
    let price = metaPrice;
    if (finiteNumber(tickPrice) && (!finiteNumber(metaPrice) || tickTime >= metaTime)) price = tickPrice;

    const prev = meta.chartPreviousClose ?? meta.previousClose;
    const change = price != null && finiteNumber(prev) ? price - prev : undefined;
    const changePct = change != null && finiteNumber(prev) ? (change / prev) * 100 : undefined;
    const dayCloses = closes.filter(finiteNumber) as number[];
    const q: Quote = {
      symbol: meta.symbol ?? sym,
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePct ?? selectCurrentChangePct(meta),
      preMarketPrice: meta.preMarketPrice,
      preMarketChangePercent: meta.preMarketChangePercent,
      postMarketPrice: meta.postMarketPrice,
      postMarketChangePercent: meta.postMarketChangePercent,
      marketState: meta.marketState,
      regularMarketVolume: meta.regularMarketVolume ?? (vols.reduce<number>((a, v) => a + (finiteNumber(v) ? v : 0), 0) || undefined),
      regularMarketDayHigh: meta.regularMarketDayHigh ?? (dayCloses.length ? Math.max(...dayCloses) : undefined),
      regularMarketDayLow: meta.regularMarketDayLow ?? (dayCloses.length ? Math.min(...dayCloses) : undefined),
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      currency: meta.currency,
      exchange: meta.exchangeName,
    };
    // Live prices go stale fast — keep the window tight.
    cacheSet(ck, q, 10_000);
    return q;
  } catch (e) {
    console.error("[yahoo] chartMeta fail", sym, String(e));
    cacheSet(ck, null, 15_000);
    return null;
  }
}

function normalizeQuote(q: any, fallbackSymbol?: string): Quote | null {
  const symbol = String(q?.symbol ?? fallbackSymbol ?? "").toUpperCase();
  const price = selectCurrentPrice(q);
  if (!symbol || !finiteNumber(price)) return null;
  return {
    symbol,
    shortName: q.shortName,
    longName: q.longName,
    regularMarketPrice: price,
    regularMarketChange: q.regularMarketChange,
    regularMarketChangePercent: selectCurrentChangePct(q),
    preMarketPrice: q.preMarketPrice,
    preMarketChangePercent: q.preMarketChangePercent,
    postMarketPrice: q.postMarketPrice,
    postMarketChangePercent: q.postMarketChangePercent,
    marketState: q.marketState,
    regularMarketVolume: q.regularMarketVolume,
    regularMarketDayHigh: q.regularMarketDayHigh,
    regularMarketDayLow: q.regularMarketDayLow,
    marketCap: q.marketCap,
    trailingPE: q.trailingPE,
    forwardPE: q.forwardPE,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    averageVolume: q.averageDailyVolume3Month ?? q.averageVolume,
    currency: q.currency,
    exchange: q.fullExchangeName ?? q.exchange,
  };
}

// Opportunistic enrichment only (marketCap / PE / avg volume). Yahoo now gates
// v7 behind a crumb, so a failure here is expected and non-fatal — never let it
// decide the price.
async function enrichFromQuoteApi(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (!symbols.length) return out;
  const path = `/v7/finance/quote?symbols=${encodeURIComponent(symbols.slice(0, 20).join(","))}`;
  const r = await yfetch(path, { tries: 1 });
  if (!r?.ok) return out;
  try {
    const j = (await r.json()) as any;
    for (const raw of j?.quoteResponse?.result ?? []) {
      const q = normalizeQuote(raw);
      if (q) out.set(q.symbol, q);
    }
  } catch { /* ignore */ }
  return out;
}

/** Drop cached quote/meta entries so the next read hits Yahoo live. */
export function invalidateQuotes(symbols: string[]) {
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    _cache.delete(`quote:${s}`);
    _cache.delete(`meta:${s}`);
  }
}

export async function getQuotes(symbols: string[], opts: { fresh?: boolean } = {}): Promise<Quote[]> {
  if (!symbols.length) return [];
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (opts.fresh) invalidateQuotes(unique);

  const out = new Map<string, Quote>();
  const CONC = 6;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONC, unique.length) }, async () => {
      while (i < unique.length) {
        const sym = unique[i++];
        const q = await fetchChartMeta(sym).catch(() => null);
        if (q) out.set(sym, { ...q, symbol: sym });
      }
    }),
  );

  // Fill fundamentals (and rescue any symbol the chart endpoint missed).
  const needsExtra = unique.filter((s) => {
    const q = out.get(s);
    return !q || q.marketCap == null;
  });
  if (needsExtra.length) {
    const extra = await enrichFromQuoteApi(needsExtra).catch(() => new Map<string, Quote>());
    for (const [sym, e] of extra) {
      const base = out.get(sym);
      if (!base) { out.set(sym, e); continue; }
      // Chart price always wins; only merge fields the chart cannot provide.
      out.set(sym, {
        ...base,
        marketCap: base.marketCap ?? e.marketCap,
        trailingPE: base.trailingPE ?? e.trailingPE,
        forwardPE: base.forwardPE ?? e.forwardPE,
        averageVolume: base.averageVolume ?? e.averageVolume,
        shortName: base.shortName ?? e.shortName,
        longName: base.longName ?? e.longName,
        marketState: base.marketState ?? e.marketState,
      });
    }
  }

  return unique.map((s) => out.get(s)).filter((q): q is Quote => Boolean(q));
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
