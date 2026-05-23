import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getMarketSnapshot, getQuotes } from "@/lib/yahoo";

export const Route = createFileRoute("/api/snapshot")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url);
          const symParam = url.searchParams.get("symbols");
          if (symParam) {
            const symbols = symParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 30);
            const quotes = await getQuotes(symbols);
            return Response.json(
              { quotes, ts: Date.now() },
              { headers: { "cache-control": "public, max-age=20" } },
            );
          }
          const snapshot = await getMarketSnapshot();
          return Response.json(
            { snapshot, ts: Date.now() },
            { headers: { "cache-control": "public, max-age=15" } },
          );
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
