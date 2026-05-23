// Monte Carlo simulation of forward price paths, drift-anchored to the
// Oracle100 behavioral final signal so the simulation reflects the system's
// current quant + behavioral read on the name.
import { createFileRoute } from "@tanstack/react-router";
import { getHistory } from "@/lib/yahoo";
import { extractCloses, logReturns, mean, stdev } from "@/lib/indicators";
import { computeOracle100 } from "@/lib/oracle100";

export const Route = createFileRoute("/api/simulate")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
        const horizon = Math.min(252, Math.max(5, Number(url.searchParams.get("horizon") ?? 60)));
        const paths = Math.min(400, Math.max(50, Number(url.searchParams.get("paths") ?? 200)));
        if (!symbol) return Response.json({ error: "symbol required" }, { status: 400 });

        try {
          const bars = await getHistory(symbol, "1y", "1d");
          const closes = extractCloses(bars);
          if (closes.length < 60) return Response.json({ error: "insufficient history" }, { status: 422 });
          const rets = logReturns(closes);
          const mu = mean(rets);
          const sigma = stdev(rets);
          const last = closes[closes.length - 1];

          // Pull behavioral drift bias from Oracle100 final signal.
          let bias = 0;
          let oracle: any = null;
          try {
            oracle = await computeOracle100({ symbol });
            // S99 in [-1,1] — scale to small daily drift (cap ±0.15% per day)
            bias = Math.max(-0.0015, Math.min(0.0015, oracle.master.final_signal * 0.0015));
          } catch { /* ignore — fallback to pure GBM */ }

          // Box-Muller normal
          const randn = () => {
            const u = 1 - Math.random();
            const v = Math.random();
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
          };

          const drift = mu + bias - 0.5 * sigma * sigma;
          const allPaths: number[][] = [];
          for (let p = 0; p < paths; p++) {
            const path: number[] = [last];
            let px = last;
            for (let t = 0; t < horizon; t++) {
              px = px * Math.exp(drift + sigma * randn());
              path.push(px);
            }
            allPaths.push(path);
          }

          // Per-step quantiles for fan chart
          const quantiles = (arr: number[], q: number) => {
            const s = arr.slice().sort((a, b) => a - b);
            const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
            return s[i];
          };
          const steps = horizon + 1;
          const p05: number[] = [], p25: number[] = [], p50: number[] = [], p75: number[] = [], p95: number[] = [];
          for (let t = 0; t < steps; t++) {
            const col = allPaths.map(pp => pp[t]);
            p05.push(quantiles(col, 0.05));
            p25.push(quantiles(col, 0.25));
            p50.push(quantiles(col, 0.50));
            p75.push(quantiles(col, 0.75));
            p95.push(quantiles(col, 0.95));
          }
          // Terminal stats
          const terminals = allPaths.map(p => p[p.length - 1]);
          const upProb = terminals.filter(x => x > last).length / terminals.length;
          const exp = mean(terminals);

          return Response.json({
            symbol, horizon, paths,
            last_price: last,
            mu_daily: mu, sigma_daily: sigma, behavioral_bias_daily: bias,
            oracle_signal: oracle?.master?.final_signal ?? null,
            fan: { p05, p25, p50, p75, p95 },
            sample_paths: allPaths.slice(0, 30),
            terminal: {
              expected: exp,
              prob_up: upProb,
              prob_up_10pct: terminals.filter(x => x > last * 1.10).length / terminals.length,
              prob_dn_10pct: terminals.filter(x => x < last * 0.90).length / terminals.length,
              p05: quantiles(terminals, 0.05),
              p95: quantiles(terminals, 0.95),
            },
            generated_at: new Date().toISOString(),
          });
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
