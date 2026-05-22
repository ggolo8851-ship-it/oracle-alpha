// Aggregated financial news engine with importance scoring.
// Pulls Yahoo Finance news for a curated set of macro + mega tickers and key
// queries, dedupes by URL, scores importance, infers sectors/countries.
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

const QUERIES = [
  "Federal Reserve", "inflation", "ECB", "Bank of Japan", "China stimulus",
  "earnings", "merger acquisition", "OPEC", "geopolitics",
  "AI chips", "Nvidia", "semiconductors", "regulation SEC", "interest rates",
  "S&P 500", "Nasdaq", "oil prices", "gold prices", "Bitcoin",
];

type NewsItem = {
  id: string;
  title: string;
  publisher: string;
  link: string;
  ts: number;
  importance: number;       // 0-100
  sectors: string[];
  countries: string[];
  impact: "BULLISH" | "BEARISH" | "MIXED" | "NEUTRAL";
  confidence: number;       // 0-100
  synthesis: string;
};

let CACHE: { ts: number; data: any } | null = null;
const TTL = 4 * 60 * 1000;

const SECTOR_KEYWORDS: Record<string, string[]> = {
  AI: ["ai", "artificial intelligence", "openai", "anthropic", "nvidia", "llm", "chatbot", "gpu"],
  Semiconductors: ["chip", "semiconductor", "tsmc", "asml", "intel", "amd", "nvidia", "fab"],
  Energy: ["oil", "opec", "crude", "natural gas", "exxon", "chevron", "lng", "shell"],
  Renewables: ["solar", "wind", "renewable", "battery", "nuclear", "smr"],
  Finance: ["bank", "jpmorgan", "goldman", "wells fargo", "fdic", "credit", "loan"],
  Crypto: ["bitcoin", "ethereum", "crypto", "btc", "eth", "coinbase", "binance"],
  Healthcare: ["fda", "biotech", "pharma", "drug", "trial", "vaccine", "lilly"],
  Defense: ["defense", "pentagon", "lockheed", "raytheon", "weapon", "military"],
  RealEstate: ["real estate", "housing", "mortgage", "reit"],
  Consumer: ["retail", "consumer", "walmart", "amazon", "tesla"],
};

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  US: ["fed", "federal reserve", "u.s.", "united states", "sec", "white house", "biden", "trump", "wall street"],
  China: ["china", "beijing", "xi", "pboc", "yuan", "shanghai", "hong kong", "hkex"],
  Japan: ["japan", "boj", "yen", "tokyo", "nikkei"],
  EU: ["ecb", "europe", "eurozone", "euro ", "germany", "france"],
  UK: ["uk", "britain", "bank of england", "sterling", "ftse"],
  India: ["india", "rbi", "rupee", "modi", "sensex", "nifty"],
  Korea: ["korea", "samsung", "won "],
  Russia: ["russia", "putin", "ruble", "kremlin"],
  MENA: ["saudi", "iran", "israel", "middle east", "opec"],
};

const HIGH_IMPACT = ["fed", "rate cut", "rate hike", "ecb", "inflation", "cpi", "ppi", "nonfarm", "war", "sanction", "tariff", "default", "bankruptcy", "merger", "acquires", "guidance", "earnings beat", "earnings miss", "downgrade", "upgrade", "halt", "recall", "fda approval", "lawsuit", "investigation"];

async function fetchQuery(q: string): Promise<any[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=8`;
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return [];
    const j = (await r.json()) as any;
    return j.news ?? [];
  } catch { return []; }
}

function classify(title: string): NewsItem["impact"] {
  const t = title.toLowerCase();
  let bull = 0, bear = 0;
  ["beat","surge","jump","record","approval","upgrade","strong","rally","breakthrough","gain","raise","expand"].forEach(w => { if (t.includes(w)) bull++; });
  ["miss","drop","plunge","cut","downgrade","weak","fall","loss","slump","probe","fraud","lawsuit","halt","recall","warn","slow"].forEach(w => { if (t.includes(w)) bear++; });
  if (bull && bear) return "MIXED";
  if (bull) return "BULLISH";
  if (bear) return "BEARISH";
  return "NEUTRAL";
}

function scoreImportance(title: string, pub: string, ts: number): number {
  const t = title.toLowerCase();
  let s = 30;
  for (const k of HIGH_IMPACT) if (t.includes(k)) s += 10;
  if (/\b(fed|ecb|boj|china)\b/.test(t)) s += 8;
  if (/\b(trillion|billion)\b/.test(t)) s += 4;
  if (["Reuters","Bloomberg","Financial Times","Wall Street Journal","CNBC"].includes(pub)) s += 6;
  const ageH = (Date.now() / 1000 - ts) / 3600;
  if (ageH < 2) s += 10; else if (ageH < 6) s += 5; else if (ageH < 24) s += 2; else s -= Math.min(20, ageH / 4);
  return Math.max(0, Math.min(100, Math.round(s)));
}

function tagFrom(text: string, map: Record<string, string[]>): string[] {
  const t = text.toLowerCase();
  return Object.entries(map).filter(([, ks]) => ks.some((k) => t.includes(k))).map(([k]) => k);
}

async function compute() {
  const batches = await Promise.all(QUERIES.map(fetchQuery));
  const seen = new Map<string, NewsItem>();
  for (const arr of batches) {
    for (const n of arr) {
      const link = n.link || n.url;
      if (!link || seen.has(link)) continue;
      const title = n.title ?? "";
      const ts = n.providerPublishTime ?? Math.floor(Date.now() / 1000);
      const publisher = n.publisher ?? "Yahoo";
      const sectors = tagFrom(title, SECTOR_KEYWORDS);
      const countries = tagFrom(title, COUNTRY_KEYWORDS);
      const impact = classify(title);
      const importance = scoreImportance(title, publisher, ts);
      const confidence = Math.min(95, 40 + sectors.length * 8 + countries.length * 6 + (impact === "NEUTRAL" ? 0 : 10));
      seen.set(link, {
        id: link,
        title,
        publisher,
        link,
        ts,
        importance,
        sectors,
        countries,
        impact,
        confidence,
        synthesis: `${impact} signal · ${sectors[0] ?? "macro"}${countries[0] ? ` · ${countries[0]}` : ""}`,
      });
    }
  }
  const items = [...seen.values()].sort((a, b) => b.importance - a.importance).slice(0, 20);
  return { generated_at: new Date().toISOString(), count: items.length, items };
}

export async function getNewsCached() {
  if (CACHE && Date.now() - CACHE.ts < TTL) return CACHE.data;
  const data = await compute();
  CACHE = { ts: Date.now(), data };
  return data;
}

export const Route = createFileRoute("/api/news")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await getNewsCached(), { headers: { "cache-control": "public, max-age=120" } });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
