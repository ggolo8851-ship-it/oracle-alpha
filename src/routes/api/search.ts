// Symbol search proxy (server-side) — calls Yahoo search.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { searchSymbols } from "@/lib/yahoo";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q")?.trim();
        if (!q) return Response.json({ quotes: [], news: [] });
        try {
          const data = await searchSymbols(q);
          return Response.json(data, {
            headers: { "cache-control": "public, max-age=30" },
          });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
