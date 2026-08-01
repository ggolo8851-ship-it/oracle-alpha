import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", Accept: "application/json,text/plain,*/*" };
export const Route = createFileRoute("/api/dbg")({
  server: { handlers: { GET: async () => {
    const urls = [
      "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=NVDA&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json",
      "https://stockanalysis.com/api/quotes/s/nvda",
      "https://api.stlouisfed.org/",
      "https://stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcv&h&e=csv",
      "https://www.stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcv&h&e=csv",
      "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=1mo",
    ];
    const out: any[] = [];
    for (const u of urls) {
      try { const r = await fetch(u, { headers: H }); const t = await r.text(); out.push({ u: u.slice(8, 45), status: r.status, head: t.slice(0, 200) }); }
      catch (e) { out.push({ u: u.slice(8, 45), err: String(e) }); }
    }
    return Response.json(out);
  } } },
});
