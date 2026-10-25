// Pure, Worker-safe calculations shared by analysis and regression tests.
export function evaluateArithmetic(expression: string): number | null {
  if (expression.length > 160 || !/^[\d\s.+\-*/()^]+$/.test(expression)) return null;
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|\*\*|[+\-*/()^]/g) ?? [];
  let index = 0;
  const peek = () => tokens[index];
  function primary(): number {
    if (peek() === "(") {
      index++;
      const result = sum();
      if (tokens[index++] !== ")") throw new Error("Missing parenthesis");
      return result;
    }
    const token = tokens[index++];
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error("Expected number");
    return Number(token);
  }
  function power(): number {
    const left = primary();
    if (peek() === "^" || peek() === "**") { index++; return left ** unary(); }
    return left;
  }
  function unary(): number {
    if (peek() === "+") { index++; return unary(); }
    if (peek() === "-") { index++; return -unary(); }
    return power();
  }
  function product(): number {
    let result = unary();
    while (peek() === "*" || peek() === "/") {
      const op = tokens[index++];
      const rhs = unary();
      if (op === "/" && rhs === 0) throw new Error("Division by zero");
      result = op === "*" ? result * rhs : result / rhs;
    }
    return result;
  }
  function sum(): number {
    let result = product();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[index++];
      const rhs = product();
      result = op === "+" ? result + rhs : result - rhs;
    }
    return result;
  }
  try {
    const value = sum();
    return index === tokens.length && Number.isFinite(value) ? value : null;
  } catch { return null; }
}

export function normalCdf(z: number): number {
  if (z === 0) return 0.5;
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - tail : tail;
}

// drift is expected LOG return; variance is horizon log-return variance.
export function lognormalSummary(spot: number, drift: number, variance: number) {
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(drift) || !Number.isFinite(variance) || variance < 0) {
    throw new Error("Invalid scenario inputs");
  }
  const sd = Math.sqrt(variance);
  const pUp = sd > 0 ? normalCdf(drift / sd) : drift > 0 ? 1 : 0;
  // Three disjoint outcomes relative to spot; base is ±half a horizon SD.
  const pBear = sd > 0 ? normalCdf((-0.5 * sd - drift) / sd) : drift < 0 ? 1 : 0;
  const pBull = sd > 0 ? 1 - normalCdf((0.5 * sd - drift) / sd) : drift > 0 ? 1 : 0;
  return {
    median: spot * Math.exp(drift),
    expectedReturn: Math.expm1(drift + variance / 2),
    p05: spot * Math.exp(drift - 1.644853626951 * sd),
    p95: spot * Math.exp(drift + 1.644853626951 * sd),
    pUp, pBear, pBull, pBase: Math.max(0, 1 - pBear - pBull),
    // Dispersion score only: not Bayesian posterior or empirical accuracy.
    dispersionConfidence: Math.exp(-variance),
  };
}