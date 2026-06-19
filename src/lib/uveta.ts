// UVETA — Unified Recursive Synthesis Architecture for Market Cognition.
// Compact, differentiable, side-effect-free. Sits on top of indicators + Oracle100
// + behavioral + meta-state and produces a recursive *understanding* state Υ
// rather than a point forecast.
//
// Axioms:
//   1. Multi-perspective cognition  Ψ = {Ψ_i}
//   2. Contradiction is information Λ = mean_{i≠j} |Ψ_i − Ψ_j|
//   3. Failure is learning          Φ = |R − R̂|
//   4. Synthesis is understanding   Ξ = Σ A_i Ψ_i      (A = softmax(Ψ/τ))
//   5. Understanding evolves        Υ_{t+1} = tanh(Υ_t ⊕ Ξ ⊕ Θ ⊕ Φ ⊕ Λ)
//
// Operators:  a ⊕ b = tanh(a + b + a·b)     synthesis
//             a △ b = |a − b|               contradiction
//             C(x)  = x / (1 + |x|)         compression
//
// All inputs/outputs are bounded in [-1, 1] so the recursion is stable.

export type UvetaPerspective = { name: string; psi: number; kappa?: number };

export type UvetaState = {
  // raw inputs
  perspectives: UvetaPerspective[];
  // derived
  attention: Record<string, number>;
  Xi: number;        // synthesis
  Lambda: number;    // contradiction
  Phi: number;       // failure (prediction error proxy)
  Theta: number;     // novelty (|Υ_t − Υ_{t-1}|)
  Omega: number;     // coherence  = e^{-Λ}
  Sigma: number;     // uncertainty (sd of Ψ)
  Upsilon: number;   // Υ_{t+1}
  // training signal
  J: number;         // objective: αΦ + βΛ − γΩ
  // semantic label
  state: "CONVERGING" | "DIVERGING" | "REFLEXIVE" | "STABLE" | "FRAGILE";
};

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const compress = (x: number) => x / (1 + Math.abs(x));
const synth = (a: number, b: number) => Math.tanh(a + b + a * b);

function softmax(vs: number[], tau = 1): number[] {
  const m = Math.max(...vs);
  const ex = vs.map((v) => Math.exp((v - m) / Math.max(tau, 1e-6)));
  const s = ex.reduce((a, b) => a + b, 0) || 1;
  return ex.map((e) => e / s);
}

function meanContradiction(ps: number[]): number {
  const n = ps.length;
  if (n < 2) return 0;
  let acc = 0, c = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) { acc += Math.abs(ps[i] - ps[j]); c++; }
  return c ? acc / c : 0;
}

function stdev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/**
 * Run one UVETA recursion step.
 *
 * @param perspectives  multi-brain readings, each Ψ ∈ [-1,1]
 * @param prevUpsilon   Υ_t (previous understanding)
 * @param actualReturn  realized log-return for the last bar (for Φ)
 * @param predictedRet  the system's prior expectation (for Φ)
 * @param weights       objective weights {α, β, γ} (default 1, 0.5, 0.5)
 * @param tau           softmax temperature
 */
export function uvetaStep(args: {
  perspectives: UvetaPerspective[];
  prevUpsilon?: number;
  actualReturn?: number;
  predictedRet?: number;
  weights?: { alpha?: number; beta?: number; gamma?: number };
  tau?: number;
}): UvetaState {
  const ps = args.perspectives.map((p) => ({
    name: p.name,
    psi: clamp(Number.isFinite(p.psi) ? p.psi : 0),
    kappa: p.kappa,
  }));
  const psiVec = ps.map((p) => p.psi);
  const baseWeights = ps.map((p, i) => (p.kappa ?? 1) * psiVec[i]);
  const A = softmax(baseWeights, args.tau ?? 1);
  const attention: Record<string, number> = {};
  ps.forEach((p, i) => (attention[p.name] = Math.round(A[i] * 1000) / 1000));

  const Xi = clamp(ps.reduce((s, p, i) => s + A[i] * p.psi, 0));
  const Lambda = clamp(meanContradiction(psiVec), 0, 1);
  const Sigma = clamp(stdev(psiVec), 0, 1);
  const Omega = clamp(Math.exp(-Lambda), 0, 1);

  const Phi =
    args.actualReturn != null && args.predictedRet != null
      ? clamp(compress(Math.abs(args.actualReturn - args.predictedRet) * 50), 0, 1)
      : 0;

  const prev = clamp(args.prevUpsilon ?? Xi);
  const Theta = clamp(Math.abs(Xi - prev), 0, 1);

  // Master equation: Υ_{t+1} = tanh( Υ_t ⊕ Ξ ⊕ (−Θ·sign drift) ⊕ (−Φ) ⊕ (−Λ) )
  // Failure & contradiction *erode* understanding; novelty perturbs it.
  let U = prev;
  U = synth(U, Xi);
  U = synth(U, -Lambda);
  U = synth(U, -Phi);
  U = synth(U, Theta * Math.sign(Xi || 1) * 0.5);
  const Upsilon = clamp(U);

  const w = args.weights ?? {};
  const alpha = w.alpha ?? 1;
  const beta = w.beta ?? 0.5;
  const gamma = w.gamma ?? 0.5;
  const J = alpha * Phi + beta * Lambda - gamma * Omega;

  const state: UvetaState["state"] =
    Phi < 0.15 && Lambda < 0.25 && Math.abs(Upsilon - prev) < 0.05
      ? "CONVERGING"
      : Lambda > 0.6
      ? "DIVERGING"
      : Theta > 0.5 && Omega < 0.6
      ? "REFLEXIVE"
      : Omega > 0.8 && Phi < 0.2
      ? "STABLE"
      : "FRAGILE";

  return {
    perspectives: ps,
    attention,
    Xi: round(Xi),
    Lambda: round(Lambda),
    Phi: round(Phi),
    Theta: round(Theta),
    Omega: round(Omega),
    Sigma: round(Sigma),
    Upsilon: round(Upsilon),
    J: round(J),
    state,
  };
}

// ── Convenience: build the 6 default perspectives from the existing stack ──
// Each Ψ ∈ [-1, 1].
export function buildPerspectives(args: {
  last: number;
  sma50?: number | null;
  sma200?: number | null;
  rsi14?: number | null;
  macdHist?: number | null;
  volZ?: number | null;          // volume z-score
  annVol?: number | null;        // annualized vol % (0..100)
  oracleSignal?: number | null;  // S99 ∈ [-1,1]
  behReflexivity?: number | null;// -1..1
  metaEdge?: number | null;      // directional edge -1..1
}): UvetaPerspective[] {
  const trend =
    args.sma200 ? clamp(Math.tanh(((args.last / args.sma200) - 1) * 4)) : 0;
  const momo =
    args.macdHist != null
      ? clamp(Math.tanh(args.macdHist))
      : args.sma50
      ? clamp(Math.tanh(((args.last / args.sma50) - 1) * 4))
      : 0;
  const psych =
    args.rsi14 != null ? clamp(((args.rsi14 - 50) / 50)) : 0;
  const flow =
    args.volZ != null ? clamp(Math.tanh(args.volZ / 2)) : 0;
  const risk =
    args.annVol != null ? clamp(-Math.tanh((args.annVol - 30) / 30)) : 0;
  const oracle = clamp(args.oracleSignal ?? 0);
  const behavior = clamp(args.behReflexivity ?? 0);
  const meta = clamp(args.metaEdge ?? 0);
  return [
    { name: "trend", psi: trend },
    { name: "momentum", psi: momo, kappa: 1.1 },
    { name: "psychology", psi: psych },
    { name: "flow", psi: flow },
    { name: "risk", psi: risk, kappa: 0.8 },
    { name: "oracle", psi: oracle, kappa: 1.2 },
    { name: "behavior", psi: behavior },
    { name: "meta", psi: meta, kappa: 1.1 },
  ];
}

function round(n: number, d = 3): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
