## Anomaly ∞ — Upgrade Plan

Scope: add memory, sharpen the math, deepen behavioral finance, add a universal stock search, and add a Top 10 Finds board. No layout teardown — everything plugs into the existing terminal.

### 1. Chat memory (so Oracle remembers)

- Persist threads + messages in `localStorage` (no auth required, instant, survives reload). Lovable Cloud not enabled — staying frontend-only keeps "don't change major things".
- Add a thin left rail in `OracleConsole`: thread list, "+ NEW THREAD", click to switch, delete.
- Use AI SDK `useChat({ id: threadId, messages: initialMessages })` so each thread has its own stream + history. Full message array is sent to `/api/chat` every turn, so the model has true conversational recall.
- Auto-title each thread from the first user message.

### 2. Better quant formulas (server-side, fed to the model)

Upgrade `get_history` tool output and add a new `get_technicals` tool. Computed in `src/routes/api/chat.ts` from real Yahoo OHLCV — model receives numbers, not vibes.

- **Returns**: log returns, total return, CAGR
- **Risk**: annualized vol (already present, fix to use sample variance n-1), **downside deviation**, **max drawdown** + duration, **Sharpe** (vs. ^TNX risk-free), **Sortino**, **Calmar**
- **Momentum**: RSI(14), MACD(12,26,9), ROC(10/30/90)
- **Trend**: SMA(20/50/200), EMA(12/26), price vs. SMA200 (regime flag)
- **Volatility**: ATR(14), Bollinger Bands(20,2), realized vol 20d/60d, vol-of-vol
- **Microstructure**: 20d avg volume, volume z-score, dollar volume

### 3. Behavioral finance layer (new tool: `get_behavioral_read`)

Computed from real market data — no fakes:
- **Fear/Greed composite** from VIX level + VIX percentile (1y), SPY 125d momentum, SPY distance from 200dma, put/call proxy via ^VIX/^VXN spread, breadth proxy via ^RUT/^GSPC ratio change. Output 0–100 with regime label.
- **Reflexivity score**: 20d correlation between price change and volume change (Soros-style feedback strength).
- **Crowding score**: rolling vol compression + RSI extreme + distance from 50dma → FOMO/capitulation flag.
- **Anchoring distance**: % from 52w high and 52w low.
- **Recency-bias warning** when last 5d return > 2σ of trailing 60d.

System prompt updated so BEHAVIOR agent must cite these numbers and name the specific bias (anchoring, recency, herding, loss aversion, disposition, narrative reflexivity) it sees.

### 4. Universal stock search (any NASDAQ/NYSE/global ticker)

- New `<SymbolSearch />` component in the header. Calls existing `searchSymbols` (Yahoo `/v1/finance/search`) — already covers every listed equity/ETF/index/crypto/FX/commodity globally.
- Debounced typeahead, keyboard nav, shows symbol + name + exchange + type.
- Selecting opens a `<TickerDetail />` slide-over panel with live quote, 52w range bar, key stats from chart meta, mini sparkline (6mo close array via existing `getHistory`), and a "Ask Oracle about $TICKER" button that injects a multi-agent prompt into the active thread.
- Accuracy: data is pulled live from Yahoo's NASDAQ-sourced feed at request time — same source institutions use for delayed quotes. We will add a clear "~15 min delayed · source: Yahoo/NASDAQ" timestamp on the panel.

### 5. Top 10 Finds board

- New `<TopFinds />` panel below `MacroGrid`.
- New server route `/api/top-finds` that:
  1. Pulls quotes for a curated 60-symbol universe (mega/large-cap US + key ETFs + leaders in semis/AI/energy/crypto-proxy).
  2. Scores each on a composite: 30% momentum (5d + 20d return), 25% trend (price vs SMA50/200), 20% relative strength vs SPY, 15% volume thrust (today vs 20d avg), 10% volatility-adjusted quality (Sharpe-lite proxy from short window).
  3. Returns top 10 sorted with a `signal` tag (BREAKOUT / MOMENTUM / REVERSAL / ACCUMULATION).
- UI: rank, ticker, price, %chg, score bar, signal chip. Click row → opens `<TickerDetail />`. Refresh every 5 min.
- New tool `get_top_finds` exposed to the model so the OPPORTUNITY agent can cite the live board.

### 6. System prompt tightening (no rewrite, just sharpen)

- Force every numeric claim to be sourced from a tool call.
- Add explicit instruction to call `get_technicals` + `get_behavioral_read` whenever a single ticker is the subject.
- Add the named bias requirement above.
- Keep tone, agent roster, scenario format, and "Not investment advice" tag unchanged.

### Technical section

Files to add:
- `src/lib/indicators.ts` — pure functions: rsi, macd, sma, ema, atr, bollinger, drawdown, sharpe, sortino, downsideDev, returns, corr.
- `src/lib/behavioral.ts` — composites built from indicators + snapshot.
- `src/lib/threads.ts` — localStorage thread CRUD + zod-validated UIMessage[] persistence.
- `src/components/SymbolSearch.tsx`
- `src/components/TickerDetail.tsx`
- `src/components/TopFinds.tsx`
- `src/components/ThreadList.tsx`
- `src/routes/api/top-finds.ts`

Files to edit:
- `src/routes/api/chat.ts` — register `get_technicals`, `get_behavioral_read`, `get_top_finds` tools; tighten system prompt; keep existing 4 tools intact.
- `src/components/OracleConsole.tsx` — accept `threadId`/`initialMessages`, wire thread switching, add left rail.
- `src/routes/index.tsx` — mount `SymbolSearch` in header, `TopFinds` under `MacroGrid`, `TickerDetail` slide-over, thread list rail.
- `src/lib/yahoo.ts` — small helper to batch quote fetch with concurrency cap for the 60-symbol universe.

No backend, no auth, no schema changes. Stays on Yahoo. Existing UI, theme, and 6-agent system unchanged in spirit.