// Region / sector hub: live quotes for a named region or sector key.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getQuotes } from "@/lib/yahoo";
import { REGIONS, SECTORS } from "@/lib/universes";

export const Route = createFileRoute("/api/region")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const u = new URL(request.url);
        const kind = u.searchParams.get("kind") ?? "region";
        const key = (u.searchParams.get("key") ?? "us").toLowerCase();
        const src = kind === "sector" ? SECTORS : REGIONS;
        const entry = (src as any)[key];
        if (!entry) return Response.json({ error: "unknown key" }, { status: 404 });
        try {
          const quotes = await getQuotes(entry.symbols);
          return Response.json(
            { kind, key, label: entry.label, flag: entry.flag, quotes },
            { headers: { "cache-control": "public, max-age=60" } },
          );
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
