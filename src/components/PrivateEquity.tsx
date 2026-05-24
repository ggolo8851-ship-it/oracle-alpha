import { useEffect, useState } from "react";
import { addWatch } from "@/lib/watchlist";

type Row = { symbol: string; name: string; price: number; changePct: number; marketCap: number | null; range52w_pct: number | null; score: number };
type Segment = { label: string; description: string; rows: Row[] };

export function PrivateEquity({ onPick, onAsk }: { onPick: (s: string) => void; onAsk: (p: string) => void }) {
  const [data, setData] = useState<Record<string, Segment> | null>(null);
  const [tab, setTab] = useState<string>("ALT_MANAGERS");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/private-equity");
        if (!r.ok) throw new Error("fetch failed");
        const j = await r.json();
        if (alive) setData(j.segments);
      } catch (e: any) { if (alive) setErr(String(e)); }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const seg = data?.[tab];

  return (
    <div className="space-y-3">
      <div className="font-mono">
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ ALTERNATIVE ASSETS</div>
        <div className="text-lg tracking-widest text-primary">PRIVATE EQUITY HUB</div>
        <div className="text-[10px] text-muted-foreground">
          Public proxies for private-market exposure — alt managers (BX, KKR, APO…), BDCs, listed-PE ETFs, and PE holdcos. Ranked by composite momentum + 52w range + AUM proxy.
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {data && Object.entries(data).map(([k, s]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1 font-mono text-[10px] tracking-widest border transition-colors ${
              tab === k
                ? "border-primary text-primary bg-secondary"
                : "border-border text-muted-foreground hover:text-primary"
            }`}
          >
            {s.label.toUpperCase()}
          </button>
        ))}
      </div>

      {err && <div className="font-mono text-xs text-destructive">ERR: {err}</div>}

      {seg && (
        <div>
          <div className="font-mono text-[10px] text-muted-foreground mb-2">{seg.description}</div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead className="text-[10px] tracking-widest text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left p-2">SYMBOL</th>
                  <th className="text-left p-2">NAME</th>
                  <th className="text-right p-2">PRICE</th>
                  <th className="text-right p-2">CHG%</th>
                  <th className="text-right p-2">52W RANGE</th>
                  <th className="text-right p-2">MCAP</th>
                  <th className="text-right p-2">SCORE</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {seg.rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-border hover:bg-secondary/40">
                    <td className="p-2">
                      <button onClick={() => onPick(r.symbol)} className="text-primary font-bold hover:underline">{r.symbol}</button>
                    </td>
                    <td className="p-2 text-foreground truncate max-w-[200px]">{r.name}</td>
                    <td className="p-2 text-right">${r.price?.toFixed(2)}</td>
                    <td className={`p-2 text-right ${r.changePct >= 0 ? "text-bull" : "text-bear"}`}>
                      {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                    </td>
                    <td className="p-2 text-right text-muted-foreground">{r.range52w_pct != null ? `${r.range52w_pct}%` : "—"}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      {r.marketCap ? `$${(r.marketCap / 1e9).toFixed(1)}B` : "—"}
                    </td>
                    <td className="p-2 text-right text-accent font-bold">{r.score}</td>
                    <td className="p-2 text-right space-x-1">
                      <button onClick={() => addWatch(r.symbol, r.price)} className="text-[9px] text-accent hover:underline">+BAG</button>
                      <button onClick={() => onAsk(`Multi-agent synthesis on ${r.symbol} — PE / private-credit angle, behavioral + risk.`)} className="text-[9px] text-primary hover:underline">ASK</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!data && !err && (
        <div className="font-mono text-xs text-muted-foreground">Loading private equity universe…</div>
      )}
    </div>
  );
}
