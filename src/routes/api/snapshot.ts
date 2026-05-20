import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getMarketSnapshot } from "@/lib/yahoo";

export const Route = createFileRoute("/api/snapshot")({
  server: {
    handlers: {
      GET: async () => {
        try {
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
