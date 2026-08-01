import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", Accept: "application/json,text/plain,*/*" };
export const Route = createFileRoute("/api/dbg")({
  server: { handlers: { GET: async () => {
    const urls = [
      "https://stockanalysis.com/api/symbol/s/nvda/history?range=1Y&period=Daily",
      "https://stockanalysis.com/api/charts/s/nvda/1Y",
      "https://stockanalysis.com/api/quotes/s/nvda/full",
      "https://stockanalysis.com/api/quotes/s/nvda,aapl",
      "https://stockanalysis.com/api/quotes/i/spx",
    ];
    const out: any[] = [];
    for (const u of urls) {
      try { const r = await fetch(u, { headers: H }); const t = await r.text(); out.push({ u: u.slice(28), status: r.status, head: t.slice(0, 300) }); }
      catch (e) { out.push({ u, err: String(e) }); }
    }
    return Response.json(out);
  } } },
});
