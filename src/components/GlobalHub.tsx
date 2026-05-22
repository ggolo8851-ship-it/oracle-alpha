import { useEffect, useState } from "react";

type Quote = {
  symbol: string; shortName?: string; longName?: string;
  regularMarketPrice?: number; regularMarketChangePercent?: number; currency?: string;
};

const REGIONS = [
  ["us","🇺🇸 United States"],["china","🇨🇳 China / HK"],["japan","🇯🇵 Japan"],
  ["korea","🇰🇷 South Korea"],["india","🇮🇳 India"],["europe","🇪🇺 Europe"],
  ["latam","🇧🇷 Latin America"],["africa","🌍 Africa / MEA"],
] as const;

const SECTORS = [
  ["technology","Technology"],["semiconductors","Semis"],["ai","AI Pure-Plays"],
  ["cybersecurity","Cybersecurity"],["finance","Finance"],["energy","Energy"],
  ["nuclear_renewables","Nuclear/Renewables"],["healthcare","Healthcare"],
  ["biotech","Biotech"],["consumer","Consumer"],["industrial","Industrial/Defense"],
  ["crypto","Crypto"],["commodities","Commodities"],
] as const;

export function GlobalHub({ onPick, onAsk }: { onPick: (s: string) => void; onAsk: (s: string) => void }) {
  const [mode, setMode] = useState<"region"|"sector">("region");
  const [key, setKey] = useState<string>("us");
  const [data, setData] = useState<{ label: string; flag?: string; quotes: Quote[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/region?kind=${mode}&key=${key}`).then(r => r.json()).then(j => {
      if (alive) setData(j);
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mode, key]);

  const list = mode === "region" ? REGIONS : SECTORS;

  return (
    <div className="font-mono">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ GLOBAL BUSINESS INTELLIGENCE</div>
          <div className="text-lg tracking-widest text-primary">{mode === "region" ? "COUNTRY HUBS" : "SECTOR HUBS"}</div>
        </div>
        <div className="flex gap-1 text-[10px]">
          {(["region","sector"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setKey(m === "region" ? "us" : "technology"); }}
              className={`px-2 py-1 tracking-widest border ${mode===m? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {list.map(([k, lbl]) => (
          <button key={k} onClick={() => setKey(k)}
            className={`px-2 py-1 text-[10px] tracking-wide border ${key===k? "border-primary text-primary bg-secondary":"border-border text-muted-foreground hover:text-foreground"}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground mb-2">
        {loading ? "loading…" : data && `${data.flag ?? ""} ${data.label} · ${data.quotes.length} instruments`}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {(data?.quotes ?? []).map((q) => {
          const chg = q.regularMarketChangePercent ?? 0;
          return (
            <button key={q.symbol} onClick={() => onPick(q.symbol)}
              className="text-left bg-card border border-border p-2 text-xs hover:border-primary transition-colors">
              <div className="flex justify-between items-baseline gap-1">
                <span className="text-primary font-bold truncate">{q.symbol}</span>
                <span className={chg >= 0 ? "text-bull" : "text-bear"}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{q.shortName ?? q.longName}</div>
              <div className="text-foreground">{q.regularMarketPrice?.toFixed(2) ?? "—"} <span className="text-[10px] text-muted-foreground">{q.currency}</span></div>
            </button>
          );
        })}
      </div>

      {data && (
        <button onClick={() => onAsk(`Give an institutional read on ${data.label}. Cite top 3 instruments, dominant narrative, macro/policy backdrop, and one asymmetric idea.`)}
          className="mt-3 text-[10px] text-primary hover:underline">ask oracle for {data.label} synthesis →</button>
      )}
    </div>
  );
}
