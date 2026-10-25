import { describe, expect, test } from "bun:test";
import { evaluateArithmetic, lognormalSummary } from "./analysis-math";
import { bollinger, calmar, logReturns, mean, rsi, sortino, stdev } from "./indicators";
import { computeMetaState, realizedRisk, regimeUncertainty } from "./meta-state";

describe("chatbot arithmetic", () => {
  test("evaluates precedence, parentheses, negatives and powers without code execution", () => {
    expect(evaluateArithmetic("2 + 3 * 4")).toBe(14);
    expect(evaluateArithmetic("(2 + 3) * 4")).toBe(20);
    expect(evaluateArithmetic("2^3^2")).toBe(512);
    expect(evaluateArithmetic("-2^2")).toBe(-4);
    expect(evaluateArithmetic("1 / 0")).toBeNull();
    expect(evaluateArithmetic("2(3)")).toBeNull();
    expect(evaluateArithmetic("globalThis.process")).toBeNull();
  });
});

describe("financial calculation regressions", () => {
  test("flat prices produce neutral RSI and finite Bollinger position", () => {
    expect(rsi(Array(30).fill(100))).toBe(50);
    expect(bollinger(Array(30).fill(100))?.pctB).toBe(0.5);
  });
  test("Sortino downside deviation includes all observed periods", () => {
    const closes = [100, 101, 99, 103, 101, 104, 102, 105, 104, 108, 106, 110];
    const returns = logReturns(closes);
    const downside = Math.sqrt(returns.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / returns.length);
    expect(sortino(closes, 0)).toBeCloseTo(mean(returns) / downside * Math.sqrt(252), 12);
  });
  test("Calmar annualization uses return intervals rather than close count", () => {
    const closes = Array.from({ length: 253 }, (_, i) => 100 + i * 0.1);
    closes[126] = 90;
    const peak = closes[125];
    expect(calmar(closes)).toBeCloseTo(25.2 / ((peak - 90) / peak * 100), 10);
  });
  test("regime entropy normalizes probabilities and handles certain regimes", () => {
    expect(regimeUncertainty([1, 0, 0, 0])).toBe(0);
    expect(regimeUncertainty([1, 1, 1, 1])).toBeCloseTo(1, 12);
    expect(regimeUncertainty([])).toBe(1);
  });
  test("realized risk preserves crash returns and chronology", () => {
    const closes = [...Array(40).fill(100), 40];
    expect(realizedRisk(closes)).toBe(Math.min(1, stdev(logReturns(closes)) * Math.sqrt(252) / 0.8));
    expect(realizedRisk(closes)).toBe(1);
  });
  test("lognormal expected arithmetic return includes variance correction", () => {
    const result = lognormalSummary(100, 0, 0.04);
    expect(result.median).toBe(100);
    expect(result.expectedReturn).toBeCloseTo(Math.expm1(0.02), 12);
    expect(result.pUp).toBe(0.5);
    expect(result.pBull + result.pBear + result.pBase).toBeCloseTo(1, 12);
    expect(result.p05).toBeLessThan(result.median);
    expect(result.p95).toBeGreaterThan(result.median);
  });
  test("same history produces identical meta-state with no random confidence", () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 0.2 + Math.sin(i));
    const oracle = { psychology: 0.1, information: 0.2, execution: 0.3, final_signal: 0.1, next_price_drift: 0.002 };
    expect(computeMetaState(closes, oracle)).toEqual(computeMetaState(closes, oracle));
    expect(() => computeMetaState([100, NaN], oracle)).toThrow();
  });
});