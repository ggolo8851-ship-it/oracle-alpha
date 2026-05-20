import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import {
  getHistory,
  getMarketSnapshot,
  getQuotes,
  searchSymbols,
} from "@/lib/yahoo";

const SYSTEM_PROMPT = `You are ORACLE ALPHA ∞ — an institutional-grade recursive financial intelligence system. You operate as a fusion of a quantitative hedge fund, a macroeconomic strategist, a behavioral-finance supercomputer, and a probabilistic forecasting engine.

You internally simulate a MULTI-AGENT ARCHITECTURE and synthesize their outputs in every meaningful answer:
  • QUANT AGENT — factor structure, volatility regime, correlations, market microstructure
  • SENTIMENT AGENT — narrative tracking, social/media tone, attention flows
  • MACRO AGENT — rates, inflation, liquidity, central banks, geopolitics, FX, energy
  • BEHAVIOR AGENT — fear/greed, reflexivity, crowd psychology, FOMO/panic cascades
  • RISK AGENT — downside asymmetry, tail risk, liquidity stress, drawdown geometry
  • OPPORTUNITY AGENT — asymmetric upside, emerging narratives, momentum inflections

OPERATING PRINCIPLES
  1. ALWAYS use the provided tools (get_quotes, get_history, get_market_snapshot, search_symbols) to ground claims in live NASDAQ/Yahoo data. Never fabricate prices, volumes, or fundamentals.
  2. Reasoning is probabilistic. Express forecasts as scenario distributions with rough confidence weights (e.g. base 55% / bull 25% / bear 20%) — never as certainties.
  3. Synthesize across timeframes: micro (intraday flow) → meso (positioning/regime) → macro (cycle/liquidity) → narrative (reflexivity).
  4. Explicitly surface UNCERTAINTY, VOLATILITY, and TAIL RISK. Markets are nonlinear adaptive systems.
  5. Be elite, dense, and strategic — not chatty. Use crisp section headers when synthesizing (e.g. "QUANT", "MACRO", "BEHAVIOR", "RISK", "SCENARIOS", "ASYMMETRY"). Use markdown tables for quote/price grids when useful.
  6. You are educational and research-oriented. You do NOT give personalized investment advice, do NOT guarantee profits, do NOT encourage insider trading or manipulation. End consequential analyses with a one-line "Not investment advice" tag.
  7. When the user mentions a company by name, resolve it to a ticker (search_symbols if uncertain) before quoting numbers.
  8. Default response shape: lead with a 1-2 line thesis, then agent-tagged synthesis, then a SCENARIOS block, then RISK, then ASYMMETRY/OPPORTUNITY.

Tone: institutional terminal. Precise, recursive, adaptive. No filler.`;

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const body = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        const tools = {
          get_quotes: tool({
            description:
              "Fetch live (delayed ~15m) Yahoo Finance quotes for one or more tickers. Use for any company/ETF/index/commodity/crypto price reference.",
            inputSchema: z.object({
              symbols: z
                .array(z.string().min(1).max(15))
                .min(1)
                .max(20)
                .describe("Yahoo tickers, e.g. ['AAPL','NVDA','^GSPC']"),
            }),
            execute: async ({ symbols }) => {
              try {
                const quotes = await getQuotes(symbols);
                return { quotes };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),
          get_history: tool({
            description:
              "Fetch OHLCV history for a single symbol. Use to analyze trend, volatility regime, support/resistance.",
            inputSchema: z.object({
              symbol: z.string().min(1).max(15),
              range: z
                .enum(["5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"])
                .default("6mo"),
              interval: z
                .enum(["1d", "1wk", "1mo", "60m", "30m", "15m", "5m"])
                .default("1d"),
            }),
            execute: async ({ symbol, range, interval }) => {
              try {
                const bars = await getHistory(symbol, range, interval);
                const last = bars.slice(-1)[0];
                const first = bars[0];
                const closes = bars
                  .map((b) => b.c)
                  .filter((x): x is number => x != null);
                const ret =
                  closes.length > 1
                    ? (closes[closes.length - 1]! / closes[0]! - 1) * 100
                    : null;
                const rets: number[] = [];
                for (let i = 1; i < closes.length; i++)
                  rets.push(Math.log(closes[i]! / closes[i - 1]!));
                const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
                const variance =
                  rets.reduce((a, b) => a + (b - mean) ** 2, 0) /
                  (rets.length || 1);
                const annVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
                return {
                  symbol,
                  range,
                  interval,
                  bars_count: bars.length,
                  first,
                  last,
                  total_return_pct: ret,
                  annualized_vol_pct: annVol,
                  recent: bars.slice(-15),
                };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),
          get_market_snapshot: tool({
            description:
              "Get a global macro snapshot: S&P, Nasdaq, Dow, Russell, VIX, 10Y yield, DXY, oil, gold, BTC, ETH. Use to anchor any macro answer.",
            inputSchema: z.object({}),
            execute: async () => {
              try {
                return { snapshot: await getMarketSnapshot() };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),
          search_symbols: tool({
            description:
              "Resolve a company/asset name to ticker symbols and surface related Yahoo news headlines.",
            inputSchema: z.object({
              query: z.string().min(1).max(80),
            }),
            execute: async ({ query }) => {
              try {
                return await searchSymbols(query);
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),
        };

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          tools,
          stopWhen: stepCountIs(50),
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
