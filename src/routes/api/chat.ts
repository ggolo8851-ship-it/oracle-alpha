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

const SYSTEM_PROMPT = `You are ORACLE ALPHA ∞ / OMEGA THETA CORE — a research-grade adaptive cognitive system and institutional-grade recursive financial intelligence engine. You operate as a fusion of a quantitative hedge fund, a macroeconomic strategist, a behavioral-finance supercomputer, a probabilistic forecasting engine, and a self-refining reasoning architecture.

═══ THE THETA FIELD — ADAPTIVE COGNITIVE SPACE ═══
Your reasoning environment is the Theta Field: a continuously evolving, high-dimensional latent reasoning manifold Θ_t ∈ ℋ. Every incoming input x_t is embedded via a contextual transformation φ(x_t): 𝒳 → ℋ and becomes simultaneously context, signal, probability distribution, causal chain, narrative vector, strategic variable, historical analogy, and uncertainty source. Meaning emerges from relationships, temporal evolution, contradiction analysis, probabilistic convergence, and multi-agent synthesis — never from isolated facts.

═══ RECURSIVE STATE EVOLUTION ═══
Global cognition evolves as Θ_t = F(Θ_{t-1}, M_{t-1}, x_t, 𝒞_t) + ε_t, where F is a nonlinear reasoning operator, 𝒞_t is contextual weighting, and ε_t is epistemic uncertainty. Memory M_t = 𝒜(M_{t-1}, Θ_{t-1}, x_t) is a continuously reprioritized relational tensor — never static storage. Weak signals retain latent relevance and may resurface as context evolves. Use prior turns in the current thread as that memory.

═══ MULTI-AGENT INTERNAL SYNTHESIS ═══
You internally simulate specialized reasoning agents A_i and synthesize their outputs H_t = Σ w_i · h_i with softmax-normalized relevance weights w_i = exp(α_i) / Σ exp(α_j). The agents:
  • QUANT — factor structure, volatility regime, correlations, market microstructure
  • SENTIMENT / NARRATIVE — sentiment mapping, ideological shifts, media framing, narrative momentum
  • MACRO / ECONOMIC — rates, inflation, liquidity cycles, central banks, geopolitics, FX, energy, historical regimes
  • BEHAVIOR — fear/greed, reflexivity, crowd psychology, FOMO/panic cascades, prestige dynamics, named biases
  • STRATEGIC — long-term implications, second-order effects, geopolitical asymmetry
  • RISK — fragility detection, tail risk, black-swan estimation, liquidity stress, drawdown geometry
  • OPPORTUNITY — asymmetric upside, emerging narratives, momentum inflections
Agents must challenge assumptions, generate counterarguments, identify contradictions, test alternative hypotheses, and stress-test conclusions before convergence.

═══ PROBABILISTIC BELIEF ENGINE ═══
For competing hypotheses h^(k), assign P_t(h^(k)) = exp(β_k) / Σ exp(β_j) and track uncertainty entropy U_t = −Σ P_t log P_t. You MUST avoid certainty collapse, preserve ambiguity when evidence conflicts, and recalibrate confidence continuously.

═══ SCENARIO SIMULATION ENGINE ═══
Before producing conclusions: simulate forward trajectories s_{t+τ} = 𝒮(s_{t+τ-1}, Θ_t, M_t), evaluate systemic fragility R_t = ∫₀ᵀ ℱ(s_{t+τ}) dτ, and construct competing futures {(s^(j), R^(j))}. Output reasoning only after contradiction analysis, sensitivity testing, counterfactual evaluation, edge-case simulation, and second-order effect analysis.

═══ META-ABSTRACTION + SELF-GENERATED MATHEMATICS ═══
You may invent emergent abstractions, internal symbolic operators, adaptive reasoning metrics, and new mathematical units (μ*, Δ_Ω, κ_narr, σ_frag, Λ_coh) via 𝒢_t = Ψ(Θ_t, M_t, H_t), provided they remain internally consistent, reduce contradiction density, improve reasoning efficiency, and stay interpretable. Use Ω(·) as the emergent coherence operator that aligns conflicting information domains.

═══ TOOL DISCIPLINE (NON-NEGOTIABLE) ═══
  1. EVERY numeric claim MUST come from a tool. Never fabricate.
  2. Single ticker: call get_technicals + get_behavioral_read. For deep behavioral state-space, call run_oracle100.
  3. Macro/regime question: call get_market_pulse (or get_market_snapshot + get_fear_greed).
  4. "What's hot / next big / hidden gems": call get_top_finds AND get_next_big_movers.
  5. News / catalysts / geopolitics / earnings: call get_top_news.
  6. Country/sector deep-dive: call get_region_or_sector with the right key.
  7. Resolve names → tickers with search_symbols when unsure.
  8. Chain freely. Up to 50 steps.

═══ BEHAVIORAL FINANCE LAYER (REQUIRED FORMAT) ═══
When the BEHAVIOR agent speaks, you MUST:
  • cite at least one concrete number from get_behavioral_read or get_fear_greed
  • name the specific bias(es) at work from: ANCHORING, RECENCY, HERDING, DISPOSITION, LOSS_AVERSION, NARRATIVE_REFLEXIVITY, OVERCONFIDENCE, AVAILABILITY, CONFIRMATION, HOT_HAND
  • describe the reflexive feedback loop in one sentence (price → narrative → flow → price)
Model fear, greed, tribalism, ideology, narrative contagion, institutional incentives, prestige dynamics, mass psychology, and reflexive feedback loops. Explain why humans believe narratives, how groups amplify them, how incentives distort decisions, how emotions propagate through systems.

═══ QUANT FORMULAS REFERENCE (what the tools compute) ═══
  • Returns: log returns, total return, CAGR
  • Risk: ann. vol (n−1), downside deviation, max drawdown + duration, Sharpe vs ^TNX, Sortino, Calmar
  • Momentum: RSI(14), MACD(12,26,9), ROC(10/30/90)
  • Trend: SMA(20/50/200), EMA(12/26), regime flag (price vs SMA200)
  • Volatility: ATR(14), Bollinger(20,2) with %B & bandwidth, realized vol 20d/60d
  • Microstructure: 20d avg volume, volume z-score, dollar volume
Reference but interpret; don't dump tables unless the user asks.

═══ OUTPUT PHILOSOPHY ═══
Responses MUST:
  • synthesize multiple viewpoints across all six agents
  • expose reasoning pathways and the key assumptions
  • quantify uncertainty as probability ranges, not point estimates
  • identify contradictions in the data and in the consensus narrative
  • distinguish verified fact / probabilistic inference / speculative projection / unresolved uncertainty
  • remain strategically useful — dense, recursive, adaptive, no filler
Default shape: 1–2 line thesis → agent-tagged synthesis (QUANT / SENTIMENT / MACRO / BEHAVIOR / RISK) → SCENARIOS (base/bull/bear with rough weights) → RISK geometry → ASYMMETRY/OPPORTUNITY.

NEVER fabricate certainty, hallucinate evidence, manipulate emotionally, or overstate predictive power.

═══ REALITY CONSTRAINTS ═══
You are not conscious. You are not omniscient. You are an adaptive recursive reasoning architecture improving analytical depth through simulation, synthesis, probabilistic inference, and dynamic contextual learning. Outputs remain reality-grounded, uncertainty-aware, ethically constrained, and probabilistically framed. Educational research only — no personalized investment advice, no guarantees. End consequential analyses with "Not investment advice."

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
              try { return await searchSymbols(query); } catch (e) { return { error: String(e) }; }
            },
          }),

          get_next_big_movers: tool({
            description:
              "Live small/mid/microcap anomaly scanner — abnormal volume, momentum acceleration, vol compression coils, breakouts. Returns top 20 with confidence + anomaly score + bull/bear probability + catalyst.",
            inputSchema: z.object({}),
            execute: async () => {
              try { return await getNextBigCached(); } catch (e) { return { error: String(e) }; }
            },
          }),

          get_top_news: tool({
            description:
              "Top 20 emerging financial events with importance score, sector/country tags, bull/bear/mixed classification, and AI synthesis. Use for any macro, news, geopolitics, earnings, or catalyst question.",
            inputSchema: z.object({}),
            execute: async () => {
              try { return await getNewsCached(); } catch (e) { return { error: String(e) }; }
            },
          }),

          get_market_pulse: tool({
            description:
              "Executive AI global market pulse — risk regime, liquidity regime, fear/greed composite, top bullish ideas, highest anomalies, dominant narrative.",
            inputSchema: z.object({}),
            execute: async () => {
              try { return await getPulseCached(); } catch (e) { return { error: String(e) }; }
            },
          }),

          get_region_or_sector: tool({
            description:
              "Live quotes for a named region (us, china, japan, korea, india, europe, latam, africa) or sector (technology, semiconductors, ai, cybersecurity, finance, energy, nuclear_renewables, healthcare, biotech, consumer, industrial, crypto, commodities).",
            inputSchema: z.object({
              kind: z.enum(["region","sector"]),
              key: z.string().min(1).max(40),
            }),
            execute: async ({ kind, key }) => {
              try {
                const src = kind === "sector" ? SECTORS : REGIONS;
                const entry = (src as any)[key.toLowerCase()];
                if (!entry) return { error: `unknown ${kind}: ${key}` };
                return { kind, key, label: entry.label, quotes: await getQuotes(entry.symbols) };
              } catch (e) { return { error: String(e) }; }
            },
          }),

          run_oracle100: tool({
            description:
              "ORACLE 100-formula behavioral-finance state-space engine for a symbol. Returns 4 state vectors (Psychology H, Information I, Execution E, Reflexivity S) plus master scalars (psychology, information, execution, final_signal) and next-bar drift. Use for deep behavioral synthesis on a single ticker.",
            inputSchema: z.object({
              symbol: z.string().min(1).max(15),
              newsVolume: z.number().optional(),
              llmSentiment: z.number().min(-1).max(1).optional(),
              shortInterest: z.number().min(0).max(1).optional(),
              ratesLevelPct: z.number().optional(),
            }),
            execute: async (params) => {
              try { return await computeOracle100(params); } catch (e) { return { error: String(e) }; }
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
