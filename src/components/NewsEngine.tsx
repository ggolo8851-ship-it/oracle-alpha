import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  id: string; title: string; publisher: string; link: string; ts: number;
  importance: number; sectors: string[]; countries: string[];
  impact: "BULLISH" | "BEARISH" | "MIXED" | "NEUTRAL";
  confidence: number; synthesis: string;
};

const IMPACT_COLOR: Record<string, string> = {
  BULLISH: "text-bull", BEARISH: "text-bear", MIXED: "text-warn", NEUTRAL: "text-muted-foreground",
};

export function NewsEngine({ onAsk }: { onAsk: (s: string) => void }) {
  const [data, setData] = useState<{ items: NewsItem[]; generated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("ALL");
  const [sector, setSector] = useState("ALL");
  const [impact, setImpact] = useState("ALL");
  const [minImp, setMinImp] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/news");
        const j = await r.json();
        if (alive) setData(j);
      } finally { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, 4 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const allCountries = useMemo(() => Array.from(new Set((data?.items ?? []).flatMap((n) => n.countries))).sort(), [data]);
  const allSectors = useMemo(() => Array.from(new Set((data?.items ?? []).flatMap((n) => n.sectors))).sort(), [data]);

  const filtered = (data?.items ?? []).filter((n) =>
    (country === "ALL" || n.countries.includes(country)) &&
    (sector === "ALL" || n.sectors.includes(sector)) &&
    (impact === "ALL" || n.impact === impact) &&
    n.importance >= minImp
  );

  return (
    <div className="font-mono">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground">▸ AI NEWS SYNTHESIS</div>
          <div className="text-lg tracking-widest text-primary">TOP 20 EMERGING EVENTS</div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {loading ? "ingesting…" : data && `${filtered.length}/${data.items.length} · ${new Date(data.generated_at).toLocaleTimeString()}`}
        </div>
      </div>

      <div className="bg-card border border-border p-2 mb-3 flex flex-wrap gap-2 text-[10px]">
        <Filter label="COUNTRY" value={country} onChange={setCountry} opts={["ALL", ...allCountries]} />
        <Filter label="SECTOR" value={sector} onChange={setSector} opts={["ALL", ...allSectors]} />
        <Filter label="IMPACT" value={impact} onChange={setImpact} opts={["ALL","BULLISH","BEARISH","MIXED","NEUTRAL"]} />
        <label className="flex items-center gap-1 ml-auto text-muted-foreground">
          MIN IMP <input type="range" min={0} max={100} step={5} value={minImp} onChange={(e) => setMinImp(+e.target.value)} className="w-24" /> {minImp}
        </label>
      </div>

      <div className="grid gap-2">
        {filtered.map((n) => (
          <div key={n.id} className="bg-card border border-border p-3 text-xs hover:border-primary transition-colors">
            <div className="flex items-start gap-3">
              <div className="text-warn font-bold w-8 text-center text-sm">{n.importance}</div>
              <div className="flex-1 min-w-0">
                <a href={n.link} target="_blank" rel="noreferrer" className="text-foreground hover:text-primary leading-snug">{n.title}</a>
                <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-muted-foreground items-center">
                  <span>{n.publisher}</span>
                  <span>·</span>
                  <span>{new Date(n.ts * 1000).toLocaleString()}</span>
                  <span className={IMPACT_COLOR[n.impact]}>● {n.impact}</span>
                  {n.sectors.map((s) => <span key={s} className="px-1.5 py-0.5 bg-secondary text-primary">{s}</span>)}
                  {n.countries.map((c) => <span key={c} className="px-1.5 py-0.5 bg-secondary text-primary">{c}</span>)}
                  <span className="ml-auto text-muted-foreground">conf {n.confidence}</span>
                </div>
              </div>
              <button onClick={() => onAsk(`Synthesize market impact, second-order effects, and historical analog for: "${n.title}". Sectors: ${n.sectors.join(",")}. Countries: ${n.countries.join(",")}.`)}
                className="text-[10px] text-primary hover:underline self-start shrink-0">ask →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Filter({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <label className="flex items-center gap-1 text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-background border border-border px-1 py-0.5 text-foreground">
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
