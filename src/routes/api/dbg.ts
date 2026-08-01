import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", Accept: "application/json,text/plain,*/*" };
export const Route = createFileRoute("/api/dbg")({
  server: { handlers: { GET: async () => {
    const out: any[] = [];
    for (const u of [
      "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1m&range=1d&includePrePost=true",
      "https://query2.finance.yahoo.com/v8/finance/chart/NVDA?interval=1m&range=1d&includePrePost=true",
      "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1d&range=5d",
      "https://stooq.com/q/l/?s=nvda.us&f=sd2t2ohlcv&h&e=csv",
    ]) {
      try { const r = await fetch(u, { headers: H }); const t = await r.text(); out.push({ u: u.slice(8, 60), status: r.status, head: t.slice(0, 120) }); }
      catch (e) { out.push({ u: u.slice(8, 60), err: String(e) }); }
    }
    return Response.json(out);
  } } },
});
