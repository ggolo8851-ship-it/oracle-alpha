// Ticker detail: live quote + 6mo close sparkline + key stats. Used by the search slide-over.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { getHistory, getQuotes } from "@/lib/yahoo";
import { extractCloses, rsi, sma } from "@/lib/indicators";

const finitePrice = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export const Route = createFileRoute("/api/ticker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = url.searchParams.get("s");
        if (!symbol) return Response.json({ error: "missing s" }, { status: 400 });
        try {
          const [quotes, bars] = await Promise.all([
            getQuotes([symbol]),
            getHistory(symbol, "6mo", "1d").catch(() => []),
          ]);
          const quote = quotes[0] ?? null;
          const livePrice = finitePrice(quote?.regularMarketPrice) ? quote.regularMarketPrice : null;
          const adjustedBars = livePrice
            ? bars.map((b, idx) => idx === bars.length - 1
              ? { ...b, c: livePrice, h: Math.max(b.h ?? livePrice, livePrice), l: Math.min(b.l ?? livePrice, livePrice), v: quote?.regularMarketVolume ?? b.v }
              : b)
            : bars;
          const closes = extractCloses(adjustedBars);
          const sparkline = closes.slice(-90);
          const stats = {
            sma50: sma(closes, 50),
            sma200: sma(closes, 200),
            rsi14: rsi(closes, 14),
          };
          return Response.json(
            { symbol, quote, sparkline, stats, ts: Date.now() },
            { headers: { "cache-control": "public, max-age=30" } },
          );
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
