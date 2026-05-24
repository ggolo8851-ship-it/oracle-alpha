// Private equity scanner — pulls live quotes for PE proxies and scores them.
import { createFileRoute } from "@tanstack/react-router";
import { getQuotes } from "@/lib/yahoo";
import { PE_UNIVERSE, type PESegment } from "@/lib/private-equity";

let cache: { at: number; data: any } | null = null;
const TTL = 60_000;

export async function getPrivateEquityCached() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const data = await compute();
  cache = { at: Date.now(), data };
  return data;
}

async function compute() {
  const out: Record<string, any> = {};
  for (const segKey of Object.keys(PE_UNIVERSE) as PESegment[]) {
    const seg = PE_UNIVERSE[segKey];
    const quotes = await getQuotes(seg.symbols).catch(() => []);
    const rows = quotes
      .filter((q) => q?.regularMarketPrice != null)
      .map((q) => {
        const chg = q.regularMarketChangePercent ?? 0;
        const range = q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow
          ? (q.regularMarketPrice! - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)
          : null;
        const score = Math.round(
          (chg * 4) +
          (range != null ? (range - 0.5) * 40 : 0) +
          (q.marketCap ? Math.log10(q.marketCap) : 0)
        );
        return {
          symbol: q.symbol,
          name: q.shortName ?? q.longName ?? q.symbol,
          price: q.regularMarketPrice,
          changePct: chg,
          marketCap: q.marketCap ?? null,
          range52w_pct: range != null ? Math.round(range * 100) : null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
    out[segKey] = { label: seg.label, description: seg.description, rows };
  }
  return { generated_at: new Date().toISOString(), segments: out };
}

export const Route = createFileRoute("/api/private-equity")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await getPrivateEquityCached());
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
