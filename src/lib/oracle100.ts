// ORACLE 100-FORMULA BEHAVIORAL CORE
// State-space implementation of the 4-module (H, I, E, S) Oracle behavioral
// engine. Pure functions; inputs derived from real Yahoo OHLCV + optional
// exogenous signals (news/social if provided). All outputs bounded.
import { getHistory } from "./yahoo";
import { extractCloses, extractVolumes, logReturns, mean, stdev } from "./indicators";

const tanh = (x: number) => Math.tanh(x);
const sigm = (x: number) => 1 / (1 + Math.exp(-x));
const sgn = Math.sign;
const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

// Exponential memory blend: y = (1-λ) prev + λ f(x)
const blend = (prev: number, x: number, lambda: number) => (1 - lambda) * prev + lambda * x;

export type OracleInputs = {
  symbol: string;
  newsVolume?: number;   // 0..∞ headlines/24h
  postsDelta?: number;   // Δ social posts vs baseline
  llmSentiment?: number; // -1..1
  algoVolumeFrac?: number; // 0..1
  shortInterest?: number;  // 0..1 fraction of float
  optionsVolume?: number;  // notional or contracts
  orderBookDepth?: number; // notional depth, larger=more liquid
  ratesLevelPct?: number;  // e.g. 10y yield %
  liquiditySpread?: number; // bp/100
};

export type OracleOutput = {
  symbol: string;
  generated_at: string;
  state: {
    H: number[]; I: number[]; E: number[]; S: number[];
  };
  master: {
    psychology: number;       // H25
    information: number;      // I50
    execution: number;        // E75
    final_signal: number;     // S99
    next_price_drift: number; // ln(P_{t+1}/P_t)
  };
  diagnostics: Record<string, number>;
};

export async function computeOracle100(input: OracleInputs): Promise<OracleOutput> {
  const bars = await getHistory(input.symbol, "1y", "1d");
  const closes = extractCloses(bars);
  const vols = extractVolumes(bars);
  if (closes.length < 60) throw new Error(`insufficient history for ${input.symbol}`);

  const γ = 1.0;
  const λ = 0.35;
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const R_t = Math.log(lastClose / prevClose);
  const rets = logReturns(closes.slice(-60));
  const sigma_t = stdev(rets) * Math.sqrt(252);
  const meanRet = mean(rets);
  const Pmax = Math.max(...closes);
  const Pmin = Math.min(...closes);
  const Pmean = mean(closes);
  const cumR = mean(rets) * rets.length;

  // ----- Module 1: HUMAN EMOTION / PSYCHOLOGY (25)
  const H: number[] = new Array(26).fill(0);
  const Hprev = H.slice();
  H[1] = blend(Hprev[1], tanh(γ * Math.max(R_t, 0) * 50), λ);          // greed core
  H[2] = blend(Hprev[2], tanh(γ * Math.max(-R_t, 0) * 50), λ);          // fear core
  H[3] = tanh(H[1] - H[2]);
  H[4] = sigm(γ * H[2] * sigma_t);
  H[5] = tanh(R_t * 50 * (1 + H[4]));
  H[6] = sigm(γ * cumR);
  H[7] = tanh(γ * (1 - sigma_t));
  H[8] = sigm(γ * sigma_t * Math.abs(H[3]));
  H[9] = tanh(H[8] * H[3]);
  H[10] = tanh(γ * (sigma_t - 0.25));
  H[11] = tanh(H[1] * (1 - H[8]));
  H[12] = tanh(γ * R_t * 50);
  H[13] = sigm(Math.abs(R_t * 50) - sigma_t);
  H[14] = tanh(rets.reduce((s, r) => s + sgn(r), 0) / rets.length);
  H[15] = tanh(H[14] * H[11]);
  H[16] = tanh((lastClose - Pmax) / Pmax);
  H[17] = tanh((lastClose - Pmin) / Pmin);
  H[18] = tanh(H[4] * H[17]);
  H[19] = tanh(H[5] - H[12]);
  H[20] = tanh(R_t * 50 * H[14]);
  H[21] = tanh(H[3] * H[8]);
  H[22] = sigm(H[2]);
  H[23] = sigm(H[1]);
  H[24] = tanh(H.slice(1, 24).reduce((a, b) => a + b, 0) / 23);
  // Weighted master psychology
  const wH = [0.04,0.04,0.08,0.05,0.06,0.04,0.03,0.05,0.04,0.04,0.05,0.05,0.04,0.04,0.04,0.05,0.05,0.04,0.04,0.04,0.05,0.04,0.04,0.06];
  H[25] = tanh(H.slice(1, 25).reduce((a, b, i) => a + b * wH[i], 0));

  // ----- Module 2: INFORMATION / NARRATIVE (26..50)
  const I: number[] = new Array(51).fill(0);
  const Iprev = I.slice();
  const newsVol = input.newsVolume ?? Math.max(1, Math.abs(R_t * 100));
  const postsΔ = input.postsDelta ?? R_t * 100;
  const llmSent = input.llmSentiment ?? sgn(R_t);
  const algoFrac = input.algoVolumeFrac ?? 0.6;

  I[26] = tanh(newsVol / 20);
  I[27] = tanh(postsΔ / 20);
  I[28] = tanh(I[27] * (1 + H[21]));
  I[29] = sigm(I[28] * H[8]);
  I[30] = 1 - sigm(Math.abs(I[29]));
  I[31] = tanh(I[28] * I[30] * H[3]);
  I[32] = sigm(I[31]);
  I[33] = tanh(I[31] - I[32]);
  I[34] = sigm(I[27]);
  I[35] = tanh(llmSent);
  I[36] = sigm(algoFrac * 3 - 1.5);
  I[37] = (1 - I[36]) * I[33] + I[36] * I[35];
  I[38] = 1 + sigm(I[27] * H[13]);
  I[39] = tanh(I[37] * I[38] / 2);
  I[40] = tanh(I[39] * H[12]);
  I[41] = 1 - sigm(sigma_t);
  I[42] = tanh(I[40] * H[21]);
  I[43] = sigm(I[42]);
  I[44] = tanh(I[43]);
  I[45] = tanh(I[40] - I[44]);
  I[46] = sigm(I[33] * H[23]);
  I[47] = tanh(I[36] * I[31]);
  I[48] = tanh(I[29] * H[2]);
  I[49] = tanh(I[47] - I[48]);
  const wI = new Array(24).fill(1 / 24);
  I[50] = tanh(I.slice(26, 50).reduce((a, b, i) => a + b * wI[i], 0));

  // ----- Module 3: MARKET STRUCTURE / EXECUTION (51..75)
  const E: number[] = new Array(76).fill(0);
  const shortInt = input.shortInterest ?? 0.05;
  const optVol = input.optionsVolume ?? 1;
  const depth = input.orderBookDepth ?? 1;
  const rates = input.ratesLevelPct ?? 4.5;
  const liqSpread = input.liquiditySpread ?? 0.5;

  E[51] = tanh(H[25] * I[50]);
  E[52] = sigm(E[51]);
  E[53] = sigm(H[2] * E[52]);
  E[54] = tanh(E[53]);
  E[55] = sigm(sigma_t);
  E[56] = tanh(liqSpread);
  E[57] = tanh(E[55] * E[56]);
  E[58] = tanh(H[7] * E[55]);
  E[59] = tanh(sigma_t);
  E[60] = 1 - tanh(depth);
  E[61] = sigm(E[57] + E[54]);
  E[62] = 1 + γ * E[61];
  E[63] = tanh(E[54]);
  E[64] = tanh(E[57]);
  E[65] = tanh(E[58] - E[59]);
  E[66] = sigm(sigma_t * I[36]);
  E[67] = tanh((rates - 4) / 2);
  E[68] = tanh(E[67]);
  E[69] = tanh(R_t * 50 * (1 - H[1]));
  E[70] = sigm((lastClose - Pmean) / Pmean);
  E[71] = tanh(shortInt * 5);
  E[72] = sigm((lastClose - Pmean) / (Pmean * 0.1));
  E[73] = tanh(optVol / 10);
  E[74] = tanh(E[61] * E[72]);
  const wE = new Array(25).fill(1 / 25);
  E[75] = tanh(E.slice(51, 75).reduce((a, b, i) => a + b * wE[i], 0));

  // ----- Module 4: REFLEXIVITY / PRICE FORMATION (76..100)
  const S: number[] = new Array(101).fill(0);
  S[76] = tanh(H[25] - I[50]);
  S[77] = 1 + γ * S[76] * E[75];
  S[78] = tanh(R_t * 50 * S[77]);
  S[79] = tanh(S[78]);
  S[80] = 0.5 + 0.5 * tanh(cumR);
  S[81] = tanh(2 - S[80]);
  S[82] = sigm(sigma_t * S[81]);
  S[83] = 4 * S[82] * (1 - S[82]) - 0.5;
  S[84] = sigm(Math.abs(S[79]));
  S[85] = (1 - S[84]) * Pmean + S[84] * lastClose;
  S[86] = tanh(S[84] * S[83]);
  S[87] = sigm(rets.reduce((s, r) => s + Math.abs(r), 0));
  S[88] = tanh(H[25] * E[51]);
  S[89] = tanh(I[35] * E[57]);
  S[90] = tanh(S[88] + S[89]);
  S[91] = Math.exp(-γ * E[62] / 10);
  S[92] = tanh(S[90] * S[91]);
  S[93] = tanh(S[92]);
  S[94] = Math.exp(γ * S[83] / 5);
  S[95] = S[93] * S[94];
  S[96] = tanh((lastClose - S[85]) / S[85]);
  S[97] = tanh(S[95] - S[96]);
  S[98] = tanh(E[69] * S[80]);
  S[99] = tanh(S[97] - S[98]);
  const scale = 0.03;
  S[100] = lastClose * Math.exp(scale * S[99]);

  return {
    symbol: input.symbol,
    generated_at: new Date().toISOString(),
    state: {
      H: H.slice(1, 26).map(v => round(v, 3)),
      I: I.slice(26, 51).map(v => round(v, 3)),
      E: E.slice(51, 76).map(v => round(v, 3)),
      S: S.slice(76, 101).map(v => round(v, 4)),
    },
    master: {
      psychology: round(H[25], 3),
      information: round(I[50], 3),
      execution: round(E[75], 3),
      final_signal: round(S[99], 3),
      next_price_drift: round(scale * S[99], 4),
    },
    diagnostics: {
      R_t: round(R_t, 4),
      ann_vol_pct: round(sigma_t * 100, 1),
      P: round(lastClose, 2),
      P_anchor: round(S[85], 2),
      P_next_est: round(S[100], 2),
      reflex_divergence: round(S[76], 3),
      avalanche_risk: round(S[87], 3),
      regime_shift: round(S[84], 3),
    },
  };
}

function round(n: number, d = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
