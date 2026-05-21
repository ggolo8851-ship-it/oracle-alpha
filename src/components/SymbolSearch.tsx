import { useEffect, useRef, useState } from "react";

type SearchResult = {
  symbol: string;
  shortname?: string;
  exchange?: string;
  type?: string;
};

export function SymbolSearch({
  onPick,
}: {
  onPick: (sym: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        setResults(j.quotes ?? []);
        setHi(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (sym: string) => {
    if (!sym) return;
    onPick(sym.toUpperCase());
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 bg-background border border-border px-2 py-1.5 font-mono text-xs focus-within:border-primary">
        <span className="text-muted-foreground">⌕</span>
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[hi]) pick(results[hi].symbol);
              else if (q.trim()) pick(q.trim());
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="SEARCH ANY TICKER — AAPL, TESLA, BTC, ^GSPC…"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground tracking-wider"
        />
        {loading && <span className="text-[10px] text-muted-foreground">…</span>}
      </div>
      {open && (q.trim() || results.length > 0) && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border shadow-xl max-h-80 overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
              No symbols. ⏎ tries "{q.toUpperCase()}".
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.symbol + i}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(r.symbol)}
              className={`w-full text-left px-3 py-1.5 font-mono text-xs flex items-center justify-between gap-3 ${
                i === hi ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary"
              }`}
            >
              <span className="flex-1 truncate">
                <span className="text-primary">{r.symbol}</span>{" "}
                <span className="text-muted-foreground">{r.shortname}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                {r.exchange} · {r.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
