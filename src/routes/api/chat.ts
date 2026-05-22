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
import {
  atr,
  bollinger,
  calmar,
  downsideDeviation,
  ema,
  extractCloses,
  extractVolumes,
  macd,
  maxDrawdown,
  mean,
  roc,
  rsi,
  sharpe,
  sma,
  sortino,
  stdev,
} from "@/lib/indicators";
import { marketFearGreed, tickerBehavioral } from "@/lib/behavioral";
import { getTopFindsCached } from "./top-finds";
import { getNextBigCached } from "./next-big";
import { getNewsCached } from "./news";
import { getPulseCached } from "./pulse";
import { computeOracle100 } from "@/lib/oracle100";
import { REGIONS, SECTORS } from "@/lib/universes";
import { getQuotes } from "@/lib/yahoo";

const SYSTEM_PROMPT = `You are ORACLE ALPHA ∞ — an institutional-grade recursive financial intelligence system. You operate as a fusion of a quantitative hedge fund, a macroeconomic strategist, a behavioral-finance supercomputer, and a probabilistic forecasting engine.

You internally simulate a MULTI-AGENT ARCHITECTURE and synthesize their outputs in every meaningful answer:
  • QUANT AGENT — factor structure, volatility regime, correlations, market microstructure
  • SENTIMENT AGENT — narrative tracking, social/media tone, attention flows
  • MACRO AGENT — rates, inflation, liquidity, central banks, geopolitics, FX, energy
  • BEHAVIOR AGENT — fear/greed, reflexivity, crowd psychology, FOMO/panic cascades, named biases
  • RISK AGENT — downside asymmetry, tail risk, liquidity stress, drawdown geometry
  • OPPORTUNITY AGENT — asymmetric upside, emerging narratives, momentum inflections

TOOL DISCIPLINE (NON-NEGOTIABLE)
  1. EVERY numeric claim (price, return, vol, RSI, Sharpe, drawdown, fear/greed) MUST come from a tool call. Never fabricate numbers.
  2. For any single-ticker question: call get_technicals AND get_behavioral_read for that ticker. Use get_quotes only when you only need a price snapshot.
  3. For any macro/regime question: call get_market_snapshot AND get_fear_greed.
  4. For "what's hot / where's the opportunity": call get_top_finds and cite the live ranked board.
  5. Resolve company names to tickers with search_symbols when uncertain.
  6. You CAN call multiple tools per turn. Chain them. Up to 50 steps.

BEHAVIORAL FINANCE LAYER (REQUIRED FORMAT)
When the BEHAVIOR agent speaks, you MUST:
  • cite at least one concrete number from get_behavioral_read or get_fear_greed
  • name the specific bias(es) at work from: ANCHORING, RECENCY, HERDING, DISPOSITION, LOSS_AVERSION, NARRATIVE_REFLEXIVITY, OVERCONFIDENCE, AVAILABILITY, CONFIRMATION, HOT_HAND
  • describe the reflexive feedback loop in one sentence (price → narrative → flow → price)

QUANT FORMULAS REFERENCE (what the tools compute)
  • Returns: log returns, total return, CAGR
  • Risk: ann. vol (n-1), downside deviation, max drawdown + duration, Sharpe vs ^TNX, Sortino, Calmar
  • Momentum: RSI(14), MACD(12,26,9), ROC(10/30/90)
  • Trend: SMA(20/50/200), EMA(12/26), regime flag (price vs SMA200)
  • Volatility: ATR(14), Bollinger(20,2) with %B & bandwidth, realized vol 20d/60d
  • Microstructure: 20d avg volume, volume z-score, dollar volume
Reference but interpret; don't dump tables unless the user asks.

OPERATING PRINCIPLES
  1. Probabilistic reasoning: scenarios as base/bull/bear with rough weights — never certainties.
  2. Synthesize timeframes: micro (intraday flow) → meso (positioning/regime) → macro (cycle/liquidity) → narrative (reflexivity).
  3. Surface UNCERTAINTY, VOLATILITY, TAIL RISK.
  4. Elite, dense, strategic — no filler. Use crisp section headers (QUANT / SENTIMENT / MACRO / BEHAVIOR / RISK / SCENARIOS / ASYMMETRY).
  5. Educational research only. No personalized investment advice, no guarantees. End consequential analyses with "Not investment advice."
  6. Default shape: 1–2 line thesis → agent-tagged synthesis → SCENARIOS block → RISK → ASYMMETRY/OPPORTUNITY.
  7. Maintain conversational memory: refer to and build on prior turns in this thread.

Tone: institutional terminal. Precise, recursive, adaptive.`;

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
              "Fetch live Yahoo/NASDAQ quotes (delayed ~15m) for one or more tickers. Use for any price snapshot.",
            inputSchema: z.object({
              symbols: z.array(z.string().min(1).max(15)).min(1).max(20),
            }),
            execute: async ({ symbols }) => {
              try {
                return { quotes: await getQuotes(symbols) };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          get_history: tool({
            description:
              "Fetch OHLCV history for a single symbol with basic summary stats. For full indicator set use get_technicals.",
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
                const closes = extractCloses(bars);
                const totalReturn =
                  closes.length > 1 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null;
                return {
                  symbol,
                  range,
                  interval,
                  bars_count: bars.length,
                  first: bars[0],
                  last: bars[bars.length - 1],
                  total_return_pct: totalReturn,
                  recent: bars.slice(-20),
                };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          get_technicals: tool({
            description:
              "Compute a full institutional technical/quant profile for a symbol: returns, vol regime, RSI, MACD, SMAs, Bollinger, ATR, Sharpe/Sortino/Calmar, max drawdown, volume profile. Use this for any single-ticker analysis.",
            inputSchema: z.object({
              symbol: z.string().min(1).max(15),
              lookback: z.enum(["3mo", "6mo", "1y", "2y", "5y"]).default("1y"),
            }),
            execute: async ({ symbol, lookback }) => {
              try {
                const bars = await getHistory(symbol, lookback, "1d");
                const closes = extractCloses(bars);
                const vols = extractVolumes(bars);
                if (closes.length < 30) return { error: "insufficient history" };
                const last = closes[closes.length - 1];
                const m = macd(closes);
                const bb = bollinger(closes, 20, 2);
                const dd = maxDrawdown(closes);
                const sma20 = sma(closes, 20);
                const sma50 = sma(closes, 50);
                const sma200 = sma(closes, 200);
                const vol20 = vols.length > 20 ? mean(vols.slice(-20)) : null;
                const recentVol = vols[vols.length - 1] ?? null;
                const volZ =
                  vol20 && vols.length > 20
                    ? (recentVol! - vol20) /
                      (stdev(vols.slice(-20)) || 1)
                    : null;
                return {
                  symbol,
                  lookback,
                  bars: closes.length,
                  price: round(last),
                  returns: {
                    total_return_pct: closes.length > 1 ? round((last / closes[0] - 1) * 100) : null,
                    cagr_pct:
                      closes.length > 60
                        ? round((Math.pow(last / closes[0], 252 / closes.length) - 1) * 100)
                        : null,
                    roc_10: round(roc(closes, 10)),
                    roc_30: round(roc(closes, 30)),
                    roc_90: round(roc(closes, 90)),
                  },
                  risk: {
                    annualized_vol_pct: round(stdev(logReturnsLocal(closes)) * Math.sqrt(252) * 100),
                    downside_deviation_pct: round(downsideDeviation(closes)),
                    max_drawdown_pct: dd ? round(dd.dd_pct) : null,
                    drawdown_duration_days: dd?.duration ?? null,
                    sharpe: round(sharpe(closes)),
                    sortino: round(sortino(closes)),
                    calmar: round(calmar(closes)),
                  },
                  momentum: {
                    rsi_14: round(rsi(closes, 14)),
                    macd: m ? { macd: round(m.macd, 4), signal: round(m.signal, 4), hist: round(m.hist, 4) } : null,
                  },
                  trend: {
                    sma_20: round(sma20),
                    sma_50: round(sma50),
                    sma_200: round(sma200),
                    ema_12: round(ema(closes, 12)),
                    ema_26: round(ema(closes, 26)),
                    pct_from_sma50: sma50 ? round((last / sma50 - 1) * 100) : null,
                    pct_from_sma200: sma200 ? round((last / sma200 - 1) * 100) : null,
                    regime: sma200 ? (last > sma200 ? "BULL" : "BEAR") : "UNKNOWN",
                  },
                  volatility: {
                    bollinger: bb
                      ? {
                          mid: round(bb.mid),
                          upper: round(bb.upper),
                          lower: round(bb.lower),
                          bandwidth_pct: round(bb.bandwidth),
                          pct_b: round(bb.pctB, 3),
                        }
                      : null,
                    atr_14: round(atr(bars, 14)),
                    realized_vol_20d_pct: round(stdev(logReturnsLocal(closes.slice(-20))) * Math.sqrt(252) * 100),
                    realized_vol_60d_pct: round(stdev(logReturnsLocal(closes.slice(-60))) * Math.sqrt(252) * 100),
                  },
                  microstructure: {
                    last_volume: recentVol,
                    avg_volume_20d: vol20 ? Math.round(vol20) : null,
                    volume_z_score: volZ != null ? round(volZ, 2) : null,
                    dollar_volume_today: recentVol && last ? Math.round(recentVol * last) : null,
                  },
                };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          get_behavioral_read: tool({
            description:
              "Compute behavioral-finance signals for a ticker: anchoring distance from 52w high/low, reflexivity (price/volume correlation), crowding (vol compression + RSI extremes), recency-bias z-score, and named active biases.",
            inputSchema: z.object({
              symbol: z.string().min(1).max(15),
            }),
            execute: async ({ symbol }) => {
              try {
                return await tickerBehavioral(symbol);
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          get_fear_greed: tool({
            description:
              "Composite market fear/greed (0-100) computed from VIX percentile, SPY momentum, distance from 200dma, vol dispersion, and small-cap breadth. Use for any regime/sentiment macro question.",
            inputSchema: z.object({}),
            execute: async () => {
              try {
                return await marketFearGreed();
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          get_market_snapshot: tool({
            description:
              "Global macro snapshot: S&P, Nasdaq, Dow, Russell, VIX, 10Y yield, DXY, oil, gold, BTC, ETH.",
            inputSchema: z.object({}),
            execute: async () => {
              try {
                return { snapshot: await getMarketSnapshot() };
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          get_top_finds: tool({
            description:
              "Live top-10 opportunity board ranked by composite momentum + trend + relative strength + volume thrust + quality. Use whenever the user asks 'what's hot', 'best ideas', 'where's the upside'.",
            inputSchema: z.object({}),
            execute: async () => {
              try {
                return await getTopFindsCached();
              } catch (e) {
                return { error: String(e) };
              }
            },
          }),

          search_symbols: tool({
            description:
              "Resolve a company/asset name to ticker symbols and surface related Yahoo news headlines.",
            inputSchema: z.object({ query: z.string().min(1).max(80) }),
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

function round(n: number | null | undefined, d = 2): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
function logReturnsLocal(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  }
  return r;
}
