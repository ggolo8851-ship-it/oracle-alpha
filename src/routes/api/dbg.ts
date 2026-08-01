import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", Accept: "application/json,text/plain,*/*" };
export const Route = createFileRoute("/api/dbg")({
  server: { handlers: { GET: async () => {
    const r = await fetch("https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=NVDA|.SPX|BTC.CM=|@CL.1&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json", { headers: H });
    const j: any = await r.json();
    const arr = j?.FormattedQuoteResult?.FormattedQuote ?? [];
    return Response.json(arr.map((q: any) => ({ symbol: q.symbol, keys: Object.keys(q), last: q.last, ch: q.change_pct, prev: q.previous_day_closing, vol: q.volume, ext: q.ExtendedMktQuote })));
  } } },
});
