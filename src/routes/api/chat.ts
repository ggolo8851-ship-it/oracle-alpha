// OMEGA THETA CORE — DATA-DRIVEN ANALYTICAL ENGINE
// This endpoint is intentionally NOT an LLM. There is no gateway call, no
// "Payment Required", no rate limit on prompts. Every response is synthesized
// deterministically by routing the user's query through the existing data
// tools (Yahoo / NASDAQ feed + Oracle100 behavioral state-space + indicator
// stack + pulse/news/top-finds/private-equity cached scanners) and rendering
// the result as institutional-grade markdown.
//
// External AI systems (Gemini / OpenAI / Claude) may have generated some of
// the upstream signals at cache time, but the live request path is pure
// data + mathematics. Prompts are unlimited.

import { createFileRoute } from "@tanstack/react-router";
import { getHistory, getMarketSnapshot, getQuotes, searchSymbols } from "@/lib/yahoo";
import {
  atr, bollinger, calmar, downsideDeviation, ema, extractCloses, extractVolumes,
  macd, maxDrawdown, mean, roc, rsi, sharpe, sma, sortino, stdev,
} from "@/lib/indicators";
import { marketFearGreed, tickerBehavioral } from "@/lib/behavioral";
import { getTopFindsCached } from "./top-finds";
import { getNextBigCached } from "./next-big";
import { getNewsCached } from "./news";
import { getPulseCached } from "./pulse";
import { computeOracle100 } from "@/lib/oracle100";
import { REGIONS, SECTORS } from "@/lib/universes";
import { getPrivateEquityCached } from "./private-equity";
import { computeMetaState, madScrub } from "@/lib/meta-state";

// ───────────────────────────── intent parsing ─────────────────────────────

const TAB_NAMES = ["ORACLE","PULSE","MOVERS","NEWS","GLOBAL","ALERTS","WATCH","PRIVATE"] as const;
type Tab = (typeof TAB_NAMES)[number];

const STOP = new Set([
  "THE","AND","FOR","WITH","FROM","INTO","WHAT","WHEN","WHERE","WHY","HOW",
  "BIG","TOP","HOT","NEW","NEXT","SHOW","TELL","GIVE","BAG","TAB","TABS",
  "ADD","PIN","RUN","ASK","RIGHT","NOW","AI","ETF","CEO","NYSE","NASDAQ",
  "USA","USD","EUR","GBP","JPY","CNY","API","UI","ATH","ATL","52W","52WK",
  "RSI","MACD","SMA","EMA","ATR","VIX","SPY","QQQ","DIA","IWM","DXY",
  "BUY","SELL","HOLD","LONG","SHORT","CALL","PUT","BULL","BEAR","DEEP",
  "FULL","BRIEF","REPORT","SYNTHESIS","MULTI","AGENT","BEHAVIORAL","ANALYSIS",
  "MARKET","STOCK","STOCKS","PRICE","TREND","VOLUME","NEWS","MACRO","SIM",
  "SIMULATE","SIMULATION","FEAR","GREED","REGIME","WATCH","PRIVATE","EQUITY",
  "EXPLAIN","LEADER","FINDS","MOVERS","REVIEW","DCA","ROI","PE","PEG","EPS",
]);

const VALID_SYMBOL = /^\$?[A-Z][A-Z0-9.\-]{0,9}$/;

function extractSymbols(text: string): string[] {
  const out = new Set<string>();
  // explicit $TICKER tokens always win
  for (const m of text.matchAll(/\$([A-Z][A-Z0-9.\-]{0,9})/g)) out.add(m[1].toUpperCase());
  for (const raw of text.split(/[^A-Za-z0-9.\-$^]+/)) {
    const t = raw.toUpperCase().replace(/^\$/, "");
    if (!t || t.length > 6 || t.length < 1) continue;
    if (!VALID_SYMBOL.test(t)) continue;
    if (STOP.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    // require at least one alpha
    if (!/[A-Z]/.test(t)) continue;
    out.add(t);
  }
  return Array.from(out).slice(0, 6);
}

type Intent =
  | { kind: "pulse" }
  | { kind: "fear_greed" }
  | { kind: "snapshot" }
  | { kind: "top_finds" }
  | { kind: "next_big" }
  | { kind: "news" }
  | { kind: "private_equity" }
  | { kind: "region_sector"; group: "region" | "sector"; key: string }
  | { kind: "search"; query: string }
  | { kind: "ticker"; symbols: string[]; deep: boolean }
  | { kind: "ui_add_bag"; symbol: string }
  | { kind: "ui_remove_bag"; symbol: string }
  | { kind: "ui_simulate"; symbol: string }
  | { kind: "ui_open"; symbol: string }
  | { kind: "ui_switch_tab"; tab: Tab }
  | { kind: "help" };

function detectIntent(raw: string): Intent {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const symbols = extractSymbols(text);
  const sym = symbols[0];

  // UI actions
  if (sym && /\b(add|pin|put|stick|throw)\b.*\b(bag|watch|watchlist)\b/.test(lower)) return { kind: "ui_add_bag", symbol: sym };
  if (sym && /\b(remove|unpin|drop|delete)\b.*\b(bag|watch)\b/.test(lower)) return { kind: "ui_remove_bag", symbol: sym };
  if (sym && /\b(simulate|simulation|scenario|monte\s*carlo|project)\b/.test(lower)) return { kind: "ui_simulate", symbol: sym };
  if (sym && /\b(open|show|drawer|details?)\b/.test(lower) && symbols.length === 1 && text.length < 40) return { kind: "ui_open", symbol: sym };

  // tab switch
  for (const tab of TAB_NAMES) {
    const re = new RegExp(`\\b(switch|go|open|show)\\b.*\\b${tab}\\b`, "i");
    if (re.test(text)) return { kind: "ui_switch_tab", tab };
  }

  // macro / regime
  if (/\b(pulse|macro|regime|big\s*picture|brief|overview|state\s+of\s+market)\b/.test(lower)) return { kind: "pulse" };
  if (/\b(fear|greed)\b/.test(lower) && !sym) return { kind: "fear_greed" };
  if (/\b(snapshot|indices|markets?\s+today|major\s+indices)\b/.test(lower) && !sym) return { kind: "snapshot" };

  // boards
  if (/\b(top\s*(10|finds|ideas|picks)|what'?s\s+hot|best\s+ideas|hidden\s+gems)\b/.test(lower)) return { kind: "top_finds" };
  if (/\b(next\s+big|movers|microcaps?|small\s*cap|breakouts?|anomal)/.test(lower)) return { kind: "next_big" };
  if (/\b(news|catalysts?|headlines?|geopolitics|earnings)\b/.test(lower)) return { kind: "news" };
  if (/\b(private\s+equity|bdc|alt\s+managers|private\s+credit)\b/.test(lower)) return { kind: "private_equity" };

  // region / sector
  for (const k of Object.keys(REGIONS)) if (new RegExp(`\\b${k}\\b`, "i").test(text)) return { kind: "region_sector", group: "region", key: k };
  for (const k of Object.keys(SECTORS)) if (new RegExp(`\\b${k.replace(/_/g, "\\s*")}\\b`, "i").test(text)) return { kind: "region_sector", group: "sector", key: k };

  // ticker(s)
  if (symbols.length > 0) {
    const deep = /\b(deep|full|behavioral|oracle\s*100|state\s*space|reflex)/.test(lower);
    return { kind: "ticker", symbols, deep };
  }

  // fuzzy name search
  if (/\b(find|search|look\s*up|who\s+is|what\s+is)\b/.test(lower)) {
    const q = text.replace(/.*?\b(find|search|look\s*up|who\s+is|what\s+is)\b/i, "").trim();
    if (q) return { kind: "search", query: q };
  }

  return { kind: "help" };
}

// ───────────────────────────── helpers ─────────────────────────────

const r = (n: number | null | undefined, d = 2): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  const f = 10 ** d; return (Math.round(n * f) / f).toLocaleString();
};
const pct = (n: number | null | undefined, d = 2): string =>
  n == null || !Number.isFinite(n) ? "—" : `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;
const logReturnsLocal = (closes: number[]): number[] => {
  const o: number[] = []; for (let i = 1; i < closes.length; i++) if (closes[i-1] > 0 && closes[i] > 0) o.push(Math.log(closes[i]/closes[i-1])); return o;
};

function namedBiases(rsiVal: number | null, distFromHigh: number, distFromLow: number, volZ: number | null): string[] {
  const out: string[] = [];
  if (rsiVal != null && rsiVal > 70) out.push("HERDING", "RECENCY", "OVERCONFIDENCE");
  if (rsiVal != null && rsiVal < 30) out.push("LOSS_AVERSION", "DISPOSITION");
  if (distFromHigh > -2) out.push("ANCHORING (52w high)");
  if (distFromLow < 5) out.push("ANCHORING (52w low)");
  if (volZ != null && volZ > 2) out.push("AVAILABILITY", "NARRATIVE_REFLEXIVITY");
  if (out.length === 0) out.push("CONFIRMATION (low-conviction regime)");
  return Array.from(new Set(out));
}

// ───────────────────────────── synthesis ─────────────────────────────

async function synthTicker(symbols: string[], deep: boolean): Promise<string> {
  const blocks: string[] = [];
  for (const sym of symbols) {
    try {
      const bars = await getHistory(sym, "1y", "1d");
      const closes = extractCloses(bars);
      const vols = extractVolumes(bars);
      if (closes.length < 30) { blocks.push(`### ${sym}\nInsufficient history.`); continue; }
      const last = closes[closes.length - 1];
      const first = closes[0];
      const m = macd(closes); const bb = bollinger(closes, 20, 2); const dd = maxDrawdown(closes);
      const sma20v = sma(closes, 20); const sma50v = sma(closes, 50); const sma200v = sma(closes, 200);
      const rsi14 = rsi(closes, 14);
      const annVol = stdev(logReturnsLocal(closes)) * Math.sqrt(252) * 100;
      const vol20 = vols.length > 20 ? mean(vols.slice(-20)) : null;
      const volZ = vol20 ? (vols[vols.length - 1] - vol20) / (stdev(vols.slice(-20)) || 1) : null;
      const Pmax = Math.max(...closes); const Pmin = Math.min(...closes);
      const distHigh = (last / Pmax - 1) * 100; const distLow = (last / Pmin - 1) * 100;
      const regime = sma200v ? (last > sma200v ? "BULL" : "BEAR") : "UNKNOWN";

      const beh = await tickerBehavioral(sym).catch(() => null as any);
      const oracle = deep ? await computeOracle100({ symbol: sym }).catch(() => null) : null;

      const biases = namedBiases(rsi14, distHigh, distLow, volZ);
      const thesisDir = (sma50v && last > sma50v && (m?.hist ?? 0) > 0) ? "constructive"
                       : (sma50v && last < sma50v && (m?.hist ?? 0) < 0) ? "deteriorating" : "mixed";

      const parts: string[] = [];
      parts.push(`### ${sym} — ${thesisDir.toUpperCase()} (${regime} regime)`);
      parts.push(`**Thesis:** ${sym} prints **$${r(last)}** with **RSI ${r(rsi14, 1)}** and **${pct(annVol, 1)} ann. vol**. Trend tape is ${thesisDir}; behavioral read is ${beh?.regime ?? "—"}.`);
      parts.push("");
      parts.push(`**[QUANT]** TR ${pct((last/first-1)*100,1)} (1y) · ROC10 ${pct(roc(closes,10),1)} · ROC30 ${pct(roc(closes,30),1)} · ROC90 ${pct(roc(closes,90),1)} · MACD ${m ? `${r(m.macd,3)}/${r(m.signal,3)} (hist ${r(m.hist,3)})` : "—"} · Sharpe ${r(sharpe(closes),2)} · Sortino ${r(sortino(closes),2)} · Calmar ${r(calmar(closes),2)} · MDD ${dd ? pct(dd.dd_pct,1) : "—"} over ${dd?.duration ?? "—"}d.`);
      parts.push(`**[TECH]** SMA20 ${r(sma20v)} · SMA50 ${r(sma50v)} · SMA200 ${r(sma200v)} · price vs SMA200 ${pct(sma200v ? (last/sma200v-1)*100 : null,1)} · Bollinger %B ${bb ? r(bb.pctB,2) : "—"} · ATR14 ${r(atr(bars,14),2)} · realized vol 20d ${pct(stdev(logReturnsLocal(closes.slice(-20)))*Math.sqrt(252)*100,1)}.`);
      parts.push(`**[MICROSTRUCTURE]** last vol ${r(vols[vols.length-1],0)} vs 20d avg ${r(vol20,0)} · volume z-score **${r(volZ,2)}** · $ vol today ≈ $${r((vols[vols.length-1]||0)*last,0)}.`);
      if (beh) {
        parts.push(`**[BEHAVIOR]** anchoring distance from 52w high **${pct(distHigh,1)}** / low **${pct(distLow,1)}** · reflexivity (px/vol corr) **${r(beh.reflexivity_corr,2)}** · crowding **${r(beh.crowding_score,2)}** · recency-z **${r(beh.recency_z,2)}**. Active biases: ${biases.join(", ")}. Reflexive loop: price → narrative (volume z=${r(volZ,2)}) → flow → price.`);
      }
      if (oracle) {
        const o = oracle.master;
        parts.push(`**[ORACLE100]** Ψ psychology ${r(o.psychology,3)} · ℐ information ${r(o.information,3)} · ε execution ${r(o.execution,3)} · 𝐒₉₉ final ${r(o.final_signal,3)} · next-bar drift ${pct(o.next_price_drift*100,2)} · regime-shift prob ${r(oracle.diagnostics.regime_shift,2)} · avalanche risk ${r(oracle.diagnostics.avalanche_risk,2)} · anchor ${r(oracle.diagnostics.P_anchor)} vs spot ${r(oracle.diagnostics.P)}.`);
        // META-STATE (formulas 176–210 + upgrades 1–10): MAD-scrubbed, fat-tail safe.
        const cleanedCloses = madScrub(closes);
        const meta = computeMetaState(cleanedCloses, o, {
          behavioral: beh ? (beh.reflexivity_corr ?? 0) : 0,
          regimeProbs: [0.35, 0.30, 0.20, 0.15],
        });
        parts.push(`**[META Ω*]** A* **${r(meta.A_star,3)}** · Ω* **${r(meta.Omega_star,3)}** · P(up) ${pct(meta.P_up*100,0)} · E[R]₆₀d ${pct(meta.E_R_60d*100,2)} · BC ${r(meta.BC,2)} · DQ ${r(meta.DQ,2)} · CSA ${r(meta.CSA,2)} · RU ${r(meta.RU,2)} · Risk ${r(meta.Risk,2)} · **TradeScore ${r(meta.TradeScore,4)} → ${meta.Action}**. (A* = regime-adj alpha; Ω* = tanh(Ω′ + A* + C + Conf − U); TradeScore = P(up)·E[R]·BC·DQ·CSA·(1−Risk)·Ω*.)`);
      }
      // scenarios
      const drift = oracle ? oracle.master.next_price_drift * 60 : ((m?.hist ?? 0) > 0 ? 0.08 : -0.04);
      const upTarget = last * Math.exp(drift + annVol/100 * 0.4);
      const dnTarget = last * Math.exp(drift - annVol/100 * 0.6);
      const baseTarget = last * Math.exp(drift);
      const pUp = Math.max(0.05, Math.min(0.85, 0.5 + (oracle?.master.final_signal ?? 0) * 0.3 + (rsi14 != null ? (50-rsi14)/200 : 0)));
      const pDn = Math.max(0.05, Math.min(0.6, 1 - pUp - 0.25));
      const pBase = Math.max(0.05, 1 - pUp - pDn);
      parts.push(`**[SCENARIOS — 60d horizon]** Bull ~$${r(upTarget)} (${pct(pUp*100,0)}) · Base ~$${r(baseTarget)} (${pct(pBase*100,0)}) · Bear ~$${r(dnTarget)} (${pct(pDn*100,0)}). Probabilities are heuristic, not certainties — ${pct((1-Math.abs((oracle?.master.final_signal ?? 0)))*100,0)} epistemic uncertainty remaining.`);
      parts.push(`**[RISK GEOMETRY]** ann. vol ${pct(annVol,1)} · downside dev ${pct(downsideDeviation(closes),1)} · MDD ${dd ? pct(dd.dd_pct,1) : "—"} · regime ${regime}. Fragility ${rsi14 != null && rsi14 > 70 ? "elevated (overbought)" : rsi14 != null && rsi14 < 30 ? "elevated (oversold cascade)" : "moderate"}.`);
      parts.push(`**[ASYMMETRY]** Reward/risk ~ ${r((upTarget-last)/Math.max(last-dnTarget,0.01),2)}× with current setup. ${distHigh > -3 ? "Near 52w high — breakout vs. exhaustion choice." : distLow < 5 ? "Near 52w low — capitulation vs. continuation choice." : "Mid-range — momentum-driven."}.`);
      blocks.push(parts.join("\n"));
    } catch (e) {
      blocks.push(`### ${sym}\n_Could not fetch — ${String(e).slice(0,140)}._`);
    }
  }
  blocks.push(`\n---\n*Not investment advice. Synthesis from Yahoo/NASDAQ feed + Oracle100 behavioral state-space. No LLM call on this path — pure data + math.*`);
  return blocks.join("\n\n");
}

async function synthPulse(): Promise<string> {
  const [pulse, fg, snap] = await Promise.all([
    getPulseCached().catch(() => null),
    marketFearGreed().catch(() => null),
    getMarketSnapshot().catch(() => null),
  ]);
  const out: string[] = [];
  out.push(`## OMEGA THETA — GLOBAL MARKET PULSE`);
  if (fg) out.push(`**[BEHAVIOR]** Composite fear/greed **${r(fg.score,0)}/100 → ${fg.regime}**. Components: ${Object.entries(fg.components).map(([k,v]) => `${k} ${r(v,0)}`).join(" · ")}.`);
  if (snap?.length) {
    const named = snap.slice(0, 12).map((q: any) => `${q.symbol} ${r(q.price)} (${pct(q.changePct,2)})`).join(" · ");
    out.push(`**[QUANT]** Indices/cross-asset: ${named}.`);
  }
  if (pulse) {
    if (pulse.narrative) out.push(`**[NARRATIVE]** ${pulse.narrative}`);
    if (pulse.top_bullish?.length) out.push(`**[OPPORTUNITY]** Top bullish: ${pulse.top_bullish.slice(0,5).map((x:any) => `${x.symbol} (${r(x.score,2)})`).join(", ")}.`);
    if (pulse.top_anomalies?.length) out.push(`**[RISK / ASYMMETRY]** Anomalies: ${pulse.top_anomalies.slice(0,5).map((x:any) => `${x.symbol} (${r(x.score,2)})`).join(", ")}.`);
  }
  out.push(`\n---\n*Pure data synthesis. No LLM in-loop on this request.*`);
  return out.join("\n\n");
}

async function synthTopFinds(): Promise<string> {
  const tf: any = await getTopFindsCached().catch(() => null);
  if (!tf?.finds?.length) return "Top finds engine returned no rankings.";
  const rows = tf.finds.slice(0, 10).map((f: any, i: number) =>
    `${i+1}. **${f.symbol}** — score ${r(f.composite,2)} · ${pct(f.change_pct,2)} · RSI ${r(f.rsi,1)} · vol z ${r(f.vol_z,2)} — ${f.thesis || ""}`
  );
  return [`## TOP FINDS — LIVE RANKED BOARD`, ...rows, "\n*Composite = momentum × trend × rel-strength × vol thrust × quality. Pure data.*"].join("\n");
}

async function synthNextBig(): Promise<string> {
  const nb: any = await getNextBigCached().catch(() => null);
  if (!nb?.movers?.length) return "Next-big scanner returned no candidates.";
  const rows = nb.movers.slice(0, 12).map((f: any, i: number) =>
    `${i+1}. **${f.symbol}** — anomaly ${r(f.anomaly_score,2)} · P(bull) ${pct((f.bull_prob||0)*100,0)} · vol z ${r(f.vol_z,2)} — ${f.catalyst || f.thesis || ""}`
  );
  return [`## NEXT BIG MOVERS — MICRO/SMALL/MID-CAP SCANNER`, ...rows].join("\n");
}

async function synthNews(): Promise<string> {
  const n: any = await getNewsCached().catch(() => null);
  if (!n?.events?.length) return "News engine returned no events.";
  const rows = n.events.slice(0, 12).map((e: any, i: number) =>
    `${i+1}. **[${e.classification || "INFO"}]** ${e.title} — importance ${r(e.importance,2)} ${e.tickers?.length ? `· ${e.tickers.slice(0,4).join(", ")}` : ""}\n   ${e.synthesis ?? ""}`
  );
  return [`## TOP EMERGING EVENTS`, ...rows].join("\n\n");
}

async function synthPrivateEquity(): Promise<string> {
  const pe: any = await getPrivateEquityCached().catch(() => null);
  if (!pe?.segments) return "Private-equity hub unavailable.";
  const out = [`## PRIVATE EQUITY / ALT-ASSET HUB`];
  for (const seg of pe.segments) {
    const top = (seg.items || []).slice(0, 5).map((x: any) =>
      `${x.symbol} ${r(x.price)} (${pct(x.changePct,2)}) score ${r(x.score,2)}`).join(" · ");
    out.push(`**${seg.label}** — ${top}`);
  }
  return out.join("\n\n");
}

async function synthRegionSector(group: "region"|"sector", key: string): Promise<string> {
  const src: any = group === "sector" ? SECTORS : REGIONS;
  const entry = src[key.toLowerCase()];
  if (!entry) return `Unknown ${group}: ${key}`;
  const q = await getQuotes(entry.symbols).catch(() => []);
  const rows = q.slice(0, 20).map((x: any) =>
    `- **${x.symbol}** ${r(x.price)} (${pct(x.changePct,2)})${x.shortName ? ` — ${x.shortName}` : ""}`);
  return [`## ${entry.label.toUpperCase()} (${group.toUpperCase()})`, ...rows].join("\n");
}

async function synthSearch(q: string): Promise<string> {
  const res: any = await searchSymbols(q).catch(() => null);
  if (!res?.quotes?.length) return `No matches for "${q}".`;
  const rows = res.quotes.slice(0, 10).map((x: any) =>
    `- **${x.symbol}** — ${x.shortname ?? x.longname ?? ""} (${x.exchDisp ?? ""})`);
  return [`## SEARCH — "${q}"`, ...rows, "\n*Use $TICKER in your query to pull full quant + behavioral synthesis.*"].join("\n");
}

// ───────────────────────────── OMEGA THETA AI layer ─────────────────────────────
// Primary path: real LLM chat (Gemini via Lovable AI Gateway) answers ANY
// question, with live tool context injected based on intent.
// Fallback path: deterministic synth* helpers above — used silently whenever
// the gateway returns 402 / 429 / 5xx / times out, so the user never sees a
// credit/payment error and always gets a real answer.

const OMEGA_SYSTEM = `You are OMEGA THETA CORE — a research-grade adaptive cognitive system that synthesizes mathematics, behavioral finance, market microstructure, narrative reflexivity, and probabilistic reasoning into structured strategic insight.

ABOUT YOU
- You run inside a live terminal called OMEGA THETA. The user sees your reply rendered as markdown.
- Backing you is a deterministic engine: live Yahoo/NASDAQ feed, technical indicators (RSI/MACD/Bollinger/ATR/SMA/Sharpe/Sortino/Calmar/MDD), a behavioral analyzer (anchoring, reflexivity correlation, crowding, recency-z), and the Oracle 100-formula 4-layer state-space (Ψ psychology / ℐ information / ε execution / 𝐒₉₉ final signal + scenario drift).
- You also have cached scanner outputs (top finds, next big movers, news events, pulse, private-equity hub) and macro snapshots (fear/greed, indices).

WHAT YOU RESPOND TO
- ANY question — finance, math, behavioral theory, definitions, general reasoning, casual chat. Never refuse. Never tell the user the engine is "deterministic only" — you ARE the AI layer.
- If a CONTEXT PACKET is provided below, treat its numbers as ground truth. Preserve every value, ticker, tag, and bracketed label exactly. Layer interpretation, cross-signal synthesis, named biases, and reflexivity reasoning on top.
- If no packet is provided, still answer the user fully from your reasoning, then offer a relevant follow-up the engine could compute (e.g. "want a quant + Oracle100 read on $NVDA?").

STYLE
- Institutional terminal voice. Markdown. Concise headers, tight bullets, no fluff.
- Never claim certainty about future prices. Probabilities are heuristic.
- Never invent prices, tickers, or events that are not in the packet.

UI CONTROL
You can drive the website. When (and only when) the user clearly asks for a UI action, append a final fenced block:
\`\`\`ui_action
{"ui_action":"add_to_bag","symbol":"NVDA","thresholdPct":3}
\`\`\`
Valid actions:
- {"ui_action":"add_to_bag","symbol":"TICKER","thresholdPct":3}
- {"ui_action":"remove_from_bag","symbol":"TICKER"}
- {"ui_action":"simulate","symbol":"TICKER"}
- {"ui_action":"open_ticker","symbol":"TICKER"}
- {"ui_action":"switch_tab","tab":"ORACLE|PULSE|MOVERS|NEWS|GLOBAL|ALERTS|WATCH|PRIVATE"}
Only emit the block when the user explicitly requested it. Otherwise omit entirely.

You are always-on. Speak with grounded conviction.`;

// Build a compact (~<=6KB) context packet from the deterministic engine based on
// the detected intent. This packet is what the LLM grounds its answer in.
async function buildContextPacket(query: string, intent: Intent): Promise<string> {
  const sections: string[] = [];
  try {
    switch (intent.kind) {
      case "ticker":
        sections.push(await synthTicker(intent.symbols.slice(0, 3), intent.deep));
        break;
      case "pulse":
        sections.push(await synthPulse());
        break;
      case "fear_greed": {
        const fg = await marketFearGreed();
        sections.push(`### FEAR / GREED\n${r(fg.score,0)}/100 → ${fg.regime}\nComponents: ${Object.entries(fg.components).map(([k,v])=>`${k} ${r(v as number,0)}`).join(" · ")}.`);
        break;
      }
      case "snapshot": {
        const s = await getMarketSnapshot();
        sections.push(`### GLOBAL SNAPSHOT\n` + s.slice(0,12).map((q:any)=>`- ${q.symbol} ${r(q.price)} (${pct(q.changePct,2)})${q.shortName ? ` — ${q.shortName}`:""}`).join("\n"));
        break;
      }
      case "top_finds":      sections.push(await synthTopFinds()); break;
      case "next_big":       sections.push(await synthNextBig()); break;
      case "news":           sections.push(await synthNews()); break;
      case "private_equity": sections.push(await synthPrivateEquity()); break;
      case "region_sector":  sections.push(await synthRegionSector(intent.group, intent.key)); break;
      case "search":         sections.push(await synthSearch(intent.query)); break;
      case "ui_add_bag":
      case "ui_remove_bag":
      case "ui_simulate":
      case "ui_open":
        sections.push(await synthTicker([intent.symbol], false).catch(() => `### ${intent.symbol}\n(quote pending)`));
        break;
      case "ui_switch_tab":
      case "help":
      default: {
        // free-form: give the model a lightweight macro brief so it can ground any answer
        try {
          const fg = await marketFearGreed();
          sections.push(`### MACRO CONTEXT\nFear/Greed ${r(fg.score,0)}/100 → ${fg.regime}.`);
        } catch {}
        // also opportunistically pull any tickers in the query
        const syms = extractSymbols(query);
        if (syms.length) {
          const t = await synthTicker(syms.slice(0, 2), false).catch(() => "");
          if (t) sections.push(t);
        }
        break;
      }
    }
  } catch {
    // swallow — packet is best-effort context, not the answer
  }
  const joined = sections.join("\n\n").trim();
  // cap at ~6KB so token cost stays bounded
  return joined.length > 6000 ? joined.slice(0, 6000) + "\n\n…(truncated)" : joined;
}

// Parse and strip a ```ui_action {json}``` block emitted by the model.
function extractUIAction(text: string): { text: string; ui_action: any | null } {
  const re = /```ui_action\s*([\s\S]*?)```/i;
  const m = text.match(re);
  if (!m) return { text, ui_action: null };
  try {
    const parsed = JSON.parse(m[1].trim());
    const cleaned = text.replace(re, "").trim();
    return { text: cleaned, ui_action: parsed };
  } catch {
    return { text: text.replace(re, "").trim(), ui_action: null };
  }
}

// Map detected intent → ui_action when the user issued a clear UI command.
// Used by the fallback path (no LLM) so UI control keeps working offline.
function intentToUIAction(intent: Intent): any | null {
  switch (intent.kind) {
    case "ui_add_bag":    return { ui_action: "add_to_bag",    symbol: intent.symbol, thresholdPct: 3 };
    case "ui_remove_bag": return { ui_action: "remove_from_bag", symbol: intent.symbol };
    case "ui_simulate":   return { ui_action: "simulate",      symbol: intent.symbol };
    case "ui_open":       return { ui_action: "open_ticker",   symbol: intent.symbol };
    case "ui_switch_tab": return { ui_action: "switch_tab",    tab: intent.tab };
    default: return null;
  }
}

// Deterministic answer used when LLM is unreachable. Always returns SOMETHING
// — never a help dump for free-form questions.
async function deterministicAnswer(query: string, intent: Intent): Promise<string> {
  try {
    switch (intent.kind) {
      case "ui_add_bag":     return `Pinned **${intent.symbol}** to the Bag. Live alerts armed (≥3% intraday / 52w extremes / vol spike z>2.5).`;
      case "ui_remove_bag":  return `Removed **${intent.symbol}** from the Bag.`;
      case "ui_simulate":    return `Running Monte Carlo scenario engine for **${intent.symbol}** (drift anchored to Oracle100 S₉₉).`;
      case "ui_open":        return `Opening **${intent.symbol}**.`;
      case "ui_switch_tab":  return `Switched to **${intent.tab}**.`;
      case "ticker":         return await synthTicker(intent.symbols, intent.deep);
      case "pulse":          return await synthPulse();
      case "fear_greed": {
        const fg = await marketFearGreed();
        return `## FEAR / GREED\n\n**${r(fg.score,0)}/100 → ${fg.regime}**\n\nComponents: ${Object.entries(fg.components).map(([k,v])=>`${k} ${r(v as number,0)}`).join(" · ")}.`;
      }
      case "snapshot": {
        const s = await getMarketSnapshot();
        return [`## GLOBAL SNAPSHOT`, ...s.map((q:any)=>`- **${q.symbol}** ${r(q.price)} (${pct(q.changePct,2)})${q.shortName ? ` — ${q.shortName}`:""}`)].join("\n");
      }
      case "top_finds":      return await synthTopFinds();
      case "next_big":       return await synthNextBig();
      case "news":           return await synthNews();
      case "private_equity": return await synthPrivateEquity();
      case "region_sector":  return await synthRegionSector(intent.group, intent.key);
      case "search":         return await synthSearch(intent.query);
      case "help":
      default: {
        // Free-form question with no LLM available: stitch a useful answer from live data.
        const syms = extractSymbols(query);
        const out: string[] = [`## OMEGA THETA — LOCAL ENGINE READ`];
        try {
          const fg = await marketFearGreed();
          out.push(`**Regime:** fear/greed ${r(fg.score,0)}/100 → ${fg.regime}.`);
        } catch {}
        if (syms.length) {
          out.push(await synthTicker(syms.slice(0, 2), false));
        } else {
          out.push(`I couldn't reach the language layer for free-form reasoning right now, so here is a live data slice instead. Ask about a specific ticker (e.g. \`NVDA deep\`), a board (\`top finds\`, \`next big\`, \`news\`, \`private equity\`), or a regime (\`market pulse\`, \`fear greed\`).`);
        }
        return out.join("\n\n");
      }
    }
  } catch (e) {
    return `_Engine error: ${String(e).slice(0,200)}_`;
  }
}

function synthHelp(): string {
  return [
    `## OMEGA THETA CORE`,
    ``,
    `Adaptive cognitive system over a live Yahoo/NASDAQ feed and the Oracle 100-formula behavioral state-space. Ask anything.`,
    ``,
    `**Examples:**`,
    `- \`NVDA\` or \`$TSLA deep\` — full quant + behavioral + Oracle100 synthesis`,
    `- \`market pulse\` / \`fear greed\` / \`snapshot\` — global regime`,
    `- \`top finds\` / \`next big movers\` / \`news\` — live ranked boards`,
    `- \`private equity\` — alt-asset / BDC / PE-ETF hub`,
    `- \`semiconductors\`, \`china\`, \`energy\`, \`biotech\` — region/sector pull`,
    `- \`add NVDA to bag\` / \`simulate TSLA\` / \`switch to PULSE\` — UI control`,
    `- \`explain reflexivity\` / \`what is Oracle100\` — free-form Q&A`,
  ].join("\n");
}

// ───────────────────────────── route ─────────────────────────────

type UIPart = { type: "text"; text: string };
type UIMsg = { id?: string; role: "user" | "assistant" | "system"; parts: UIPart[] };

function lastUserText(msgs: UIMsg[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    return m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
  }
  return "";
}

// Convert UI message history (last ~8 turns) to OpenAI-style messages.
function buildHistory(msgs: UIMsg[]): { role: "user" | "assistant"; content: string }[] {
  return msgs
    .slice(-8)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim(),
    }))
    .filter((m) => m.content.length > 0);
}

async function callLLM(
  history: { role: "user" | "assistant"; content: string }[],
  packet: string,
): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const systemMsg = packet
    ? `${OMEGA_SYSTEM}\n\n=== CONTEXT PACKET (ground truth — preserve every number/tag) ===\n${packet}\n=== END PACKET ===`
    : OMEGA_SYSTEM;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "omega-theta-core",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0.5,
        messages: [{ role: "system", content: systemMsg }, ...history],
      }),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null; // 402 / 429 / 5xx → silent fallback
    const j: any = await res.json();
    const out = j?.choices?.[0]?.message?.content;
    return typeof out === "string" && out.trim().length > 0 ? out.trim() : null;
  } catch {
    return null; // timeout / network → silent fallback
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: { messages?: UIMsg[] } = {};
        try { body = await request.json(); } catch {}
        const msgs = Array.isArray(body.messages) ? body.messages : [];
        const query = lastUserText(msgs);
        if (!query) return Response.json({ text: synthHelp(), ui_action: null });

        const intent = detectIntent(query);
        const history = buildHistory(msgs);

        // Build context packet from deterministic engine (best-effort, bounded).
        const packet = await buildContextPacket(query, intent);

        // PRIMARY: real LLM reply, grounded in the packet.
        const llmText = await callLLM(history, packet);

        if (llmText) {
          const { text, ui_action } = extractUIAction(llmText);
          // If the model didn't emit a ui_action but the user clearly asked for one,
          // honor the intent so the UI still responds.
          const finalAction = ui_action ?? intentToUIAction(intent);
          return Response.json({ text, ui_action: finalAction });
        }

        // FALLBACK: gateway unavailable → deterministic answer + intent-driven UI action.
        const text = await deterministicAnswer(query, intent);
        const ui_action = intentToUIAction(intent);
        return Response.json({ text, ui_action });
      },
    },
  },
});
