// Market data layer — multi-source, accuracy-first.
//
// Yahoo's public endpoints rate-limit (HTTP 429) aggressively from shared server
// IPs, which is why quotes previously came back empty or stale. This module now
// resolves every price through a prioritized ladder of independent sources and
// only ever returns a price it actually received from a live feed:
//
//   1. CNBC realtime quote service — one batched request for up to 30 symbols,
//      covers equities, ETFs, indices, futures and crypto, and carries
//      pre/after-hours prints. Primary because it is both fastest and cheapest.
//   2. Yahoo 1-minute chart (incl. pre/post) — freshest tick when reachable.
//   3. stockanalysis.com quote API — final equity fallback.
//
// History resolves Yahoo first, then stockanalysis.com daily bars.

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
  regularMarketPreviousClose?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  averageVolume?: number;
  currency?: string;
  exchange?: string;
  source?: string;
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
  if (_cache.size > 800) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function finiteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Parse "1,234.56" / "+2.93%" / "-1.77" → number, or undefined. */
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(/[,%\s$]/g, "");
  if (!cleaned || cleaned === "-" || /^(NA|N\/A|UNCH)$/i.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
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
  const pick = state.includes("PRE")
    ? q?.preMarketChangePercent
    : state.includes("POST")
      ? q?.postMarketChangePercent
      : q?.regularMarketChangePercent;
  return typeof pick === "number" && Number.isFinite(pick) ? pick : q?.regularMarketChangePercent;
}

// ─── source 1: CNBC realtime quotes (batched) ─────────────────────────────

const CNBC_SYMBOL_MAP: Record<string, string> = {
  "^GSPC": ".SPX",
  "^IXIC": ".IXIC",
  "^DJI": ".DJI",
  "^RUT": ".RUT",
  "^VIX": ".VIX",
  "^TNX": "US10Y",
  "^FTSE": ".FTSE",
  "^N225": ".N225",
  "^HSI": ".HSI",
  "^GDAXI": ".GDAXI",
  "^STOXX50E": ".STOXX50E",
  "DX-Y.NYB": ".DXY",
};

function toCnbcSymbol(sym: string): string {
  const s = sym.toUpperCase();
  if (CNBC_SYMBOL_MAP[s]) return CNBC_SYMBOL_MAP[s];
  if (s.startsWith("^")) return "." + s.slice(1);
  if (s.endsWith("=F")) return "@" + s.slice(0, -2) + ".1";
  if (s.endsWith("-USD")) return s.slice(0, -4) + ".CM=";
  return s;
}

async function fetchCnbcQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  if (!symbols.length) return out;
  const byCnbc = new Map<string, string>();
  for (const s of symbols) byCnbc.set(toCnbcSymbol(s), s);
  const url =
    "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=" +
    encodeURIComponent(Array.from(byCnbc.keys()).join("|")) +
    "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json";
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return out;
    const j = (await r.json()) as any;
    const raw = j?.FormattedQuoteResult?.FormattedQuote;
    const arr: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const q of arr) {
      const yahooSym = byCnbc.get(String(q?.symbol ?? "").toUpperCase()) ?? String(q?.symbol ?? "").toUpperCase();
      const regular = num(q?.last);
      if (!finiteNumber(regular)) continue;
      const prev = num(q?.previous_day_closing);
      const regularPct = num(q?.change_pct);

      const ext = q?.ExtendedMktQuote;
      const extPrice = num(ext?.last);
      const extPct = num(ext?.change_pct);
      const extType = String(ext?.type ?? "").toUpperCase();
      const isPre = extType.includes("PRE");
      const isPost = extType.includes("POST") || extType.includes("AFTER");

      const quote: Quote = {
        symbol: yahooSym,
        shortName: q?.name ?? q?.altName,
        longName: q?.altName ?? q?.name,
        regularMarketPrice: regular,
        regularMarketChange: num(q?.change),
        regularMarketChangePercent: regularPct,
        regularMarketPreviousClose: prev,
        marketState: isPre ? "PRE" : isPost ? "POST" : String(q?.curmktstatus ?? "REGULAR").toUpperCase().includes("OPEN") ? "REGULAR" : "CLOSED",
        preMarketPrice: isPre ? extPrice : undefined,
        preMarketChangePercent: isPre ? extPct : undefined,
        postMarketPrice: isPost ? extPrice : undefined,
        postMarketChangePercent: isPost ? extPct : undefined,
        regularMarketVolume: num(q?.volume),
        regularMarketDayHigh: num(q?.high),
        regularMarketDayLow: num(q?.low),
        marketCap: num(String(q?.mktcapView ?? "").replace(/T$/i, "e12").replace(/B$/i, "e9").replace(/M$/i, "e6")),
        trailingPE: num(q?.pe),
        forwardPE: num(q?.fpe),
        fiftyTwoWeekHigh: num(q?.yrhiprice),
        fiftyTwoWeekLow: num(q?.yrloprice),
        averageVolume: num(q?.tendayavgvol),
        currency: q?.currencyCode,
        exchange: q?.exchange,
        source: "cnbc",
      };
      out.set(yahooSym, quote);
    }
  } catch { /* fall through to next source */ }
  return out;
}

// ─── source 2: Yahoo 1-minute chart ───────────────────────────────────────

async function yfetch(path: string, opts: { tries?: number } = {}): Promise<Response | null> {
  const tries = opts.tries ?? 2;
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  for (let attempt = 0; attempt < tries; attempt++) {
    const host = hosts[attempt % hosts.length];
    try {
      const r = await fetch(host + path, { headers: UA });
      if (r.ok) return r;
      if (r.status !== 429 && r.status < 500) return r; // real 4xx (e.g. bad symbol)
    } catch { /* network — retry */ }
    if (attempt < tries - 1) await sleep(250 * (attempt + 1) + Math.floor(Math.random() * 150));
  }
  return null;
}

async function fetchYahooQuote(sym: string): Promise<Quote | null> {
  try {
    const path = `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`;
    const r = await yfetch(path);
    if (!r || !r.ok) return null;
    const j = (await r.json()) as any;
    const res = j?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta) return null;

    // Prefer the most recent of (last 1m tick, meta price).
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    let tickPrice: number | undefined;
    let tickTime = 0;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (finiteNumber(closes[i])) { tickPrice = closes[i] as number; tickTime = ts[i] ?? 0; break; }
    }
    const metaPrice = selectCurrentPrice(meta);
    const metaTime = Number(meta.regularMarketTime ?? 0);
    let price = metaPrice;
    if (finiteNumber(tickPrice) && (!finiteNumber(metaPrice) || tickTime >= metaTime)) price = tickPrice;
    if (!finiteNumber(price)) return null;

    const prev = num(meta.chartPreviousClose ?? meta.previousClose);
    const change = finiteNumber(prev) ? price - prev : undefined;
    const changePct = change != null && finiteNumber(prev) ? (change / prev) * 100 : undefined;
    const dayCloses = closes.filter(finiteNumber) as number[];
    return {
      symbol: String(meta.symbol ?? sym).toUpperCase(),
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePct ?? selectCurrentChangePct(meta),
      regularMarketPreviousClose: prev,
      marketState: meta.marketState,
      regularMarketVolume: meta.regularMarketVolume,
      regularMarketDayHigh: meta.regularMarketDayHigh ?? (dayCloses.length ? Math.max(...dayCloses) : undefined),
      regularMarketDayLow: meta.regularMarketDayLow ?? (dayCloses.length ? Math.min(...dayCloses) : undefined),
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      currency: meta.currency,
      exchange: meta.exchangeName,
      source: "yahoo",
    };
  } catch {
    return null;
  }
}

// ─── source 3: stockanalysis.com (equities/ETFs) ──────────────────────────

function saSlug(sym: string): string | null {
  const s = sym.toUpperCase();
  if (s.startsWith("^") || s.includes("=F") || s.endsWith("-USD") || s.includes(".NYB")) return null;
  return s.replace(/\./g, ".").toLowerCase();
}

async function fetchStockAnalysisQuote(sym: string): Promise<Quote | null> {
  const slug = saSlug(sym);
  if (!slug) return null;
  try {
    const r = await fetch(`https://stockanalysis.com/api/quotes/s/${encodeURIComponent(slug)}`, { headers: UA });
    if (!r.ok) return null;
    const j = (await r.json()) as any;
    const d = j?.data;
    const regular = num(d?.p);
    if (!finiteNumber(regular)) return null;
    const session = String(d?.es ?? "").toUpperCase();
    const extPrice = num(d?.ep);
    const extPct = num(d?.ec);
    const isPre = session.includes("PRE");
    const isPost = session.includes("AFTER") || session.includes("POST");
    return {
      symbol: sym.toUpperCase(),
      regularMarketPrice: regular,
      regularMarketChange: num(d?.c),
      regularMarketChangePercent: num(d?.cp),
      regularMarketPreviousClose: num(d?.cl),
      marketState: isPre ? "PRE" : isPost ? "POST" : "REGULAR",
      preMarketPrice: isPre ? extPrice : undefined,
      preMarketChangePercent: isPre ? extPct : undefined,
      postMarketPrice: isPost ? extPrice : undefined,
      postMarketChangePercent: isPost ? extPct : undefined,
      regularMarketDayHigh: num(d?.h),
      regularMarketDayLow: num(d?.l),
      regularMarketVolume: num(d?.v),
      currency: "USD",
      source: "stockanalysis",
    };
  } catch {
    return null;
  }
}

// ─── public quote API ─────────────────────────────────────────────────────

/** Drop cached quote entries so the next read hits the live feeds. */
export function invalidateQuotes(symbols: string[]) {
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    _cache.delete(`quote:${s}`);
    _cache.delete(`meta:${s}`);
  }
}

/** Resolve the tradable "current" price honoring pre/after-hours sessions. */
export function currentPrice(q: Quote | null | undefined): number | undefined {
  return q ? selectCurrentPrice(q) : undefined;
}

export async function getQuotes(symbols: string[], opts: { fresh?: boolean } = {}): Promise<Quote[]> {
  if (!symbols.length) return [];
  const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (opts.fresh) invalidateQuotes(unique);

  const resolved = new Map<string, Quote>();
  const missing: string[] = [];
  for (const s of unique) {
    const hit = cacheGet<Quote>(`quote:${s}`);
    if (hit) resolved.set(s, hit);
    else missing.push(s);
  }

  // 1) one batched CNBC request for everything still missing
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    const batch = await fetchCnbcQuotes(chunk);
    for (const [sym, q] of batch) resolved.set(sym, q);
  }

  // 2) Yahoo per-symbol for whatever CNBC could not price
  let stillMissing = unique.filter((s) => !resolved.has(s));
  if (stillMissing.length) {
    const CONC = 5;
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONC, stillMissing.length) }, async () => {
        while (i < stillMissing.length) {
          const sym = stillMissing[i++];
          const q = await fetchYahooQuote(sym).catch(() => null);
          if (q) resolved.set(sym, { ...q, symbol: sym });
        }
      }),
    );
  }

  // 3) stockanalysis.com last resort (US equities/ETFs)
  stillMissing = unique.filter((s) => !resolved.has(s));
  if (stillMissing.length) {
    const CONC = 5;
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONC, stillMissing.length) }, async () => {
        while (i < stillMissing.length) {
          const sym = stillMissing[i++];
          const q = await fetchStockAnalysisQuote(sym).catch(() => null);
          if (q) resolved.set(sym, q);
        }
      }),
    );
  }

  // Live prices go stale fast — tight cache window keeps chat answers exact
  // without hammering the upstream feeds.
  for (const [sym, q] of resolved) cacheSet(`quote:${sym}`, q, 10_000);

  return unique.map((s) => resolved.get(s)).filter((q): q is Quote => Boolean(q));
}

// ─── history ──────────────────────────────────────────────────────────────

export type Bar = { t: number; o: number|null; h: number|null; l: number|null; c: number|null; v: number|null };

const SA_RANGE: Record<string, string> = {
  "5d": "1M", "1mo": "1M", "3mo": "6M", "6mo": "1Y", "1y": "1Y", "2y": "5Y", "5y": "5Y", "10y": "10Y", max: "MAX",
};

async function fetchStockAnalysisHistory(symbol: string, range: string): Promise<Bar[] | null> {
  const slug = saSlug(symbol);
  if (!slug) return null;
  const saRange = SA_RANGE[range] ?? "1Y";
  try {
    const r = await fetch(
      `https://stockanalysis.com/api/symbol/s/${encodeURIComponent(slug)}/history?range=${saRange}&period=Daily`,
      { headers: UA },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as any;
    const rows: any[] = j?.data ?? [];
    if (!rows.length) return null;
    const bars: Bar[] = rows
      .map((row) => ({
        t: Math.floor(new Date(`${row.t}T20:00:00Z`).getTime() / 1000),
        o: num(row.o) ?? null,
        h: num(row.h) ?? null,
        l: num(row.l) ?? null,
        c: num(row.c ?? row.a) ?? null,
        v: num(row.v) ?? null,
      }))
      .filter((b) => Number.isFinite(b.t) && b.c != null)
      .sort((a, b) => a.t - b.t);
    return bars.length ? bars : null;
  } catch {
    return null;
  }
}

export async function getHistory(
  symbol: string,
  range = "6mo",
  interval = "1d",
): Promise<Bar[]> {
  const ck = `hist:${symbol}:${range}:${interval}`;
  const hit = cacheGet<Bar[]>(ck);
  if (hit !== undefined) return hit;

  const ttl = interval.endsWith("m") || interval === "1h" ? 120_000 : 600_000;
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const r = await yfetch(path, { tries: 3 });
  if (r?.ok) {
    try {
      const j = (await r.json()) as any;
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const q = res?.indicators?.quote?.[0] ?? {};
      const bars: Bar[] = ts.map((t, i) => ({
        t,
        o: q.open?.[i] ?? null,
        h: q.high?.[i] ?? null,
        l: q.low?.[i] ?? null,
        c: q.close?.[i] ?? null,
        v: q.volume?.[i] ?? null,
      }));
      if (bars.some((b) => b.c != null)) {
        cacheSet(ck, bars, ttl);
        return bars;
      }
    } catch { /* fall through to fallback source */ }
  }

  // Fallback: stockanalysis.com daily bars (indicators stay computable even
  // while Yahoo is rate-limiting us).
  const fallback = await fetchStockAnalysisHistory(symbol, range);
  if (fallback) {
    cacheSet(ck, fallback, ttl);
    return fallback;
  }

  // Last resort: serve any stale cached series for this symbol.
  for (const [k, e] of _cache) {
    if (k.startsWith(`hist:${symbol}:`)) return e.v as Bar[];
  }
  throw new Error(`history ${symbol}: unavailable`);
}

// ─── search ───────────────────────────────────────────────────────────────

export async function searchSymbols(query: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query,
  )}&quotesCount=10&newsCount=4`;
  try {
    const r = await fetch(url, { headers: UA });
    if (r.ok) {
      const j = (await r.json()) as any;
      const quotes = (j.quotes ?? []).map((q: any) => ({
        symbol: q.symbol,
        shortname: q.shortname ?? q.longname,
        exchange: q.exchDisp,
        type: q.quoteType,
      }));
      if (quotes.length) {
        return {
          quotes,
          news: (j.news ?? []).map((n: any) => ({
            title: n.title,
            publisher: n.publisher,
            link: n.link,
            providerPublishTime: n.providerPublishTime,
          })),
        };
      }
    }
  } catch { /* fall through */ }

  // Fallback search (stockanalysis.com) keeps the ticker lookup alive when
  // Yahoo rate-limits.
  try {
    const r = await fetch(`https://stockanalysis.com/api/search?q=${encodeURIComponent(query)}`, { headers: UA });
    if (r.ok) {
      const j = (await r.json()) as any;
      const rows: any[] = j?.data ?? [];
      return {
        quotes: rows.slice(0, 10).map((row) => ({
          symbol: String(row.s ?? "").toUpperCase().replace(/^S\//, ""),
          shortname: row.n,
          exchange: row.e ?? "",
          type: row.t ?? "EQUITY",
        })).filter((q) => q.symbol),
        news: [],
      };
    }
  } catch { /* ignore */ }
  return { quotes: [], news: [] };
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
