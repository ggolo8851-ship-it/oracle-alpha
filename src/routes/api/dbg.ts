import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dbg")({
  server: { handlers: { GET: async () => {
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=1m&range=1d&includePrePost=true", { headers: { "User-Agent": "Mozilla/5.0" } });
      const t = await r.text();
      return Response.json({ status: r.status, len: t.length, head: t.slice(0, 200) });
    } catch (e) { return Response.json({ err: String(e) }); }
  } } },
});
