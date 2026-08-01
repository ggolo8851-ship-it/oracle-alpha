import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getQuotes } from "@/lib/yahoo";

export const Route = createFileRoute("/api/dbg")({
  server: { handlers: { GET: async () => {
    const logs: any[] = [];
    const orig = console.error;
    console.error = (...a: any[]) => { logs.push(a.map(String).join(" ")); orig(...a); };
    try {
      const q = await getQuotes(["NVDA"], { fresh: true });
      return Response.json({ q, logs });
    } catch (e) { return Response.json({ err: String(e), logs }); }
    finally { console.error = orig; }
  } } },
});
