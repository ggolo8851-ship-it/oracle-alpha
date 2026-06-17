// OMEGA THETA — META-STATE LAYER (formulas 176–210 + upgrades 1–10)
// Sits on top of Oracle100 + behavioral + indicator stack and produces the
// adaptive intelligence numbers the chatbot grounds its reasoning in:
//   A_t*  — regime-adjusted alpha
//   Ω_t*  — meta-recursive market state
//   BC_t  — Bayesian / cross-source confidence
//   DQ_t  — composite data quality
//   CSA_t — cross-source agreement
//   TradeScore — final unified decision score
// Plus MAD-based outlier scrubbing for fat-tailed price series.
import { extractCloses, logReturns, mean, stdev } from "./indicators";

const tanh = Math.tanh;
const sigm = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ── Upgrade 1: MAD outlier scrub (fat-tail safe) ───────────────────────────
export function madScrub(values: number[], threshold = 3.5): number[] {
  if (values.length < 5) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const devs = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = devs[Math.floor(devs.length / 2)];
  if (!mad) return values;
  return values.filter((v) => Math.abs((0.6745 * (v - med)) / mad) <= threshold);
}

// ── Upgrade 6: Cross-source agreement ──────────────────────────────────────
// Given a set of [-1..1] sentiment-like signals, returns fraction agreeing
// with the dominant sign.
export function crossSourceAgreement(signals: number[]): number {
  const valid = signals.filter((s) => Number.isFinite(s) && s !== 0);
  if (valid.length === 0) return 0.5;
  const pos = valid.filter((s) => s > 0).length;
  const neg = valid.length - pos;
  return Math.max(pos, neg) / valid.length;
}

// ── Upgrade 2/3/5: per-doc data quality (trust × freshness × verification × len × sentiment confidence)
export function docDataQuality(d: {
  source_trust?: number;
  historical_accuracy?: number;
  freshness?: number;    // 0..1 (1 = brand new)
  verified?: boolean;
  length?: number;       // chars
  sentiment_confidence?: number; // 0..1
}): number {
  const adjTrust = 0.7 * (d.source_trust ?? 0.5) + 0.3 * (d.historical_accuracy ?? 0.5);
  const lenScore = Math.min((d.length ?? 0) / 500, 1);
  const sc = d.sentiment_confidence ?? 1;
  const dq =
    0.35 * adjTrust +
    0.25 * (d.freshness ?? 0.5) +
    0.20 * (d.verified ? 1 : 0.4) +
    0.10 * lenScore +
    0.10 * sc;
  return clamp01(dq);
}

// ── Upgrade 7: regime-aware trust threshold ────────────────────────────────
export function regimeTrustThreshold(regime: string): number {
  switch (regime) {
    case "EXTREME_FEAR":  return 0.80;
    case "FEAR":          return 0.70;
    case "GREED":         return 0.60;
    case "EXTREME_GREED": return 0.75;
    default:              return 0.55;
  }
}

// ── 196: Bayesian confidence from forecast dispersion ──────────────────────
export function bayesianConfidence(scenarioPrices: number[]): number {
  if (!scenarioPrices.length) return 0.5;
  const m = mean(scenarioPrices);
  const v = stdev(scenarioPrices) ** 2;
  if (!m) return 0.5;
  return clamp01(1 - v / (m * m));
}

// ── 200: regime uncertainty (entropy of regime probs) ──────────────────────
export function regimeUncertainty(probs: number[]): number {
  const ps = probs.filter((p) => p > 0);
  if (!ps.length) return 0;
  const H = -ps.reduce((s, p) => s + p * Math.log(p), 0);
  return clamp01(H / Math.log(ps.length || 2));
}

// ── 176–178: A_t*  — regime-adjusted alpha
//   A_t = Σ w_k · module_k    (psychology, info, execution, behavioral S, X-block, leadership)
//   A_t* = A_t · max(P(regime))
export function computeAStar(args: {
  psychology: number;   // H25
  information: number;  // I25
  execution: number;    // E25
  final_signal: number; // S99
  behavioral?: number;  // composite -1..1
  leadership?: number;  // L20 -1..1
  macro?: number;       // X22 -1..1
  regimeProbs?: number[]; // distribution over regimes
}): number {
  const A =
    0.22 * args.psychology +
    0.20 * args.information +
    0.18 * args.execution +
    0.14 * args.final_signal +
    0.10 * (args.behavioral ?? 0) +
    0.08 * (args.leadership ?? 0) +
    0.08 * (args.macro ?? 0);
  const peak = args.regimeProbs?.length
    ? Math.max(...args.regimeProbs)
    : 0.6;
  return Math.max(-1, Math.min(1, A * peak));
}

// ── 184: Ω_t* = tanh(Ω' + A* + C - U + Conf)
export function computeOmegaStar(args: {
  omegaPrime: number;     // current recursive state Ω' -1..1
  aStar: number;
  causal: number;         // C_t -1..1
  confidence: number;     // 0..1
  uncertainty: number;    // 0..1
}): number {
  return tanh(args.omegaPrime + args.aStar + args.causal + args.confidence - args.uncertainty);
}

// ── Upgrade 10: unified TradeScore
// TradeScore = P(up) · E[R] · BC · DQ · CSA · (1 - Risk)
export function tradeScore(args: {
  pUp: number;        // 0..1
  expectedReturn: number;
  bayesianConf: number; // 0..1
  dataQuality: number;  // 0..1
  csa: number;          // 0..1
  risk: number;         // 0..1
}): number {
  return (
    args.pUp *
    args.expectedReturn *
    args.bayesianConf *
    args.dataQuality *
    args.csa *
    (1 - args.risk)
  );
}

// Convenience: realized risk from cleaned close series.
export function realizedRisk(closes: number[]): number {
  const cleaned = madScrub(closes);
  const ann = stdev(logReturns(cleaned)) * Math.sqrt(252);
  return clamp01(ann / 0.8); // 80% ann vol = max risk
}

// Convenience: package the full meta-state from a closes array + Oracle100 master.
export function computeMetaState(closes: number[], oracle: {
  psychology: number; information: number; execution: number; final_signal: number;
  next_price_drift: number;
}, opts?: {
  behavioral?: number; leadership?: number; macro?: number;
  regimeProbs?: number[]; csaSignals?: number[]; docs?: Parameters<typeof docDataQuality>[0][];
  causal?: number;
}) {
  const cleaned = madScrub(closes);
  const last = cleaned[cleaned.length - 1];
  const drift = oracle.next_price_drift * 60; // 60-bar horizon
  const vol = stdev(logReturns(cleaned)) * Math.sqrt(252);

  // Quick Monte Carlo around drift for BC
  const mc: number[] = [];
  for (let i = 0; i < 200; i++) {
    const z = randNorm();
    mc.push(last * Math.exp(drift + vol * 0.4 * z));
  }
  const bc = bayesianConfidence(mc);
  const pUp = clamp01(0.5 + oracle.final_signal * 0.3 + sigm(drift) * 0.1);
  const eR = drift; // expected log-return over horizon
  const risk = realizedRisk(closes);

  const csa = opts?.csaSignals?.length
    ? crossSourceAgreement(opts.csaSignals)
    : 0.6;
  const dq = opts?.docs?.length
    ? mean(opts.docs.map(docDataQuality))
    : 0.7;
  const bcAdj = clamp01(bc * csa); // upgrade 6: BC' = BC × CSA
  const ru = regimeUncertainty(opts?.regimeProbs ?? [0.4, 0.3, 0.2, 0.1]);

  const aStar = computeAStar({
    psychology: oracle.psychology, information: oracle.information,
    execution: oracle.execution, final_signal: oracle.final_signal,
    behavioral: opts?.behavioral, leadership: opts?.leadership, macro: opts?.macro,
    regimeProbs: opts?.regimeProbs,
  });
  const omegaPrime = tanh(oracle.final_signal + oracle.psychology * 0.3);
  const omegaStar = computeOmegaStar({
    omegaPrime, aStar, causal: opts?.causal ?? 0,
    confidence: bcAdj, uncertainty: ru,
  });

  const ts = tradeScore({
    pUp, expectedReturn: eR,
    bayesianConf: bcAdj, dataQuality: dq, csa, risk,
  }) * omegaStar;

  const action: "BUY" | "SHORT" | "HOLD" =
    ts > 0.005 ? "BUY" : ts < -0.005 ? "SHORT" : "HOLD";

  return {
    A_star: round(aStar, 3),
    Omega_star: round(omegaStar, 3),
    BC: round(bcAdj, 3),
    DQ: round(dq, 3),
    CSA: round(csa, 3),
    RU: round(ru, 3),
    P_up: round(pUp, 3),
    E_R_60d: round(eR, 4),
    Risk: round(risk, 3),
    TradeScore: round(ts, 4),
    Action: action,
  };
}

function randNorm(): number {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round(n: number, d = 3): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export { extractCloses };
