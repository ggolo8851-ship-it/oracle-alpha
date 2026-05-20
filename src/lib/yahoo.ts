// Unofficial Yahoo Finance helpers. Public endpoints, delayed quotes.

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

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const out: Quote[] = [];
  // Use chart endpoint per-symbol (more reliable than v7/quote which is gated).
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          sym,
        )}?interval=1d&range=5d`;
        const r = await fetch(url, { headers: UA });
        if (!r.ok) return;
        const j = (await r.json()) as any;
        const res = j?.chart?.result?.[0];
        const meta = res?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose ?? meta.previousClose;
        const change = price != null && prev != null ? price - prev : undefined;
        const changePct =
          change != null && prev ? (change / prev) * 100 : undefined;
        out.push({
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
        });
      } catch {
        // ignore
      }
    }),
  );
  return out;
}

export async function getHistory(
  symbol: string,
  range = "6mo",
  interval = "1d",
) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`history ${symbol}: ${r.status}`);
  const j = (await r.json()) as any;
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error("no data");
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  return ts.map((t, i) => ({
    t,
    o: q.open?.[i] ?? null,
    h: q.high?.[i] ?? null,
    l: q.low?.[i] ?? null,
    c: q.close?.[i] ?? null,
    v: q.volume?.[i] ?? null,
  }));
}

export async function searchSymbols(query: string) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query,
  )}&quotesCount=8&newsCount=4`;
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
  // Key macro tickers
  const tickers = [
    "^GSPC", // S&P 500
    "^IXIC", // Nasdaq Composite
    "^DJI", // Dow
    "^RUT", // Russell
    "^VIX", // Volatility
    "^TNX", // 10Y yield
    "DX-Y.NYB", // Dollar index
    "CL=F", // Crude
    "GC=F", // Gold
    "BTC-USD",
    "ETH-USD",
  ];
  return getQuotes(tickers);
}
