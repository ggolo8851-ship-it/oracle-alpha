## Goal

Make the OMEGA THETA console behave like a real AI chatbot that answers **any** question the user asks (not just ticker/macro intents), while keeping all existing formulas, Oracle100 math, and data tools intact and avoiding any "Payment Required / credits" failure the user ever sees.

## Problem with the current state

`src/routes/api/chat.ts` is a deterministic router. If the user asks something off-script (e.g. "explain reflexivity", "what should I do with my portfolio", "summarize today"), `detectIntent` falls through to `synthHelp()` and prints the help menu. The LLM enhancement layer I added only re-phrases the deterministic packet — it never *generates* an answer when there is no packet. That's why it stops feeling like an AI.

Also, on a 402/429 from the gateway the user currently gets the raw help menu instead of a real answer.

## Fix (high level)

Switch the chat endpoint to an **AI-first** architecture with a **deterministic safety net**:

1. **Primary path — real LLM chat.** Every user message goes to Gemini (via the Lovable AI Gateway) with:
   - The OMEGA THETA system prompt (cognitive-system persona, no certainty claims).
   - Live tool outputs injected as context whenever the message mentions a ticker, macro topic, news, private equity, etc. — pulled from the existing functions (`computeOracle100`, `tickerBehavioral`, `getPulseCached`, `getTopFindsCached`, `getNextBigCached`, `getNewsCached`, `getPrivateEquityCached`, `getQuotes`, `getHistory`, `indicators.*`).
   - The same UI-action grammar (`ui_add_to_bag`, `ui_simulate`, `ui_switch_tab`, …) so the model can drive the website.
   - **No formula changes.** Oracle100, indicators, behavioral scoring, scenarios, private-equity scoring all stay byte-identical.

2. **Unlimited-prompt guarantee — deterministic fallback.** If the gateway returns 402 (credits), 429 (rate limit), 5xx, or times out:
   - Quietly fall back to the existing deterministic synthesizer for the matched intent.
   - If no intent matches (free-form question), fall back to a generic "engine offline, here's what the data shows right now" packet built from `marketFearGreed` + snapshot, so the user *always* gets a real reply — never a credit error, never a raw help dump.

3. **UI actions still work in both modes.** Whether the answer comes from the LLM or the fallback, the response shape stays `{ text, ui_action }` so `OracleConsole` → `index.tsx` keeps routing tab switches, bag adds, simulations, etc.

4. **Console UX cleanup.** Restore the "AI" framing in `OracleConsole.tsx` header copy ("ADAPTIVE COGNITIVE SYSTEM") and make the error pill never show credit/payment language — only a soft "retrying with local engine…" if both paths fail.

## What does *not* change

- `src/lib/oracle100.ts` — every H/I/E/S formula kept exactly.
- `src/lib/behavioral.ts`, `src/lib/indicators.ts`, `src/lib/private-equity.ts`, `src/lib/universes.ts`, `src/lib/watchlist.ts` — untouched.
- All `/api/*` data routes (`pulse`, `news`, `top-finds`, `next-big`, `private-equity`, `simulate`, `ticker`, `snapshot`, `search`, `region`, `alerts`) — untouched.
- All UI tabs (PULSE, MOVERS, NEWS, GLOBAL, ALERTS, WATCH, PRIVATE), the Bag, the simulation drawer, ticker detail, watch alerts — untouched.

## Files to edit

- `src/routes/api/chat.ts` — replace deterministic-first routing with **LLM-first + tool-context injection + deterministic fallback**. Keep every existing `synth*` helper as the fallback layer.
- `src/components/OracleConsole.tsx` — small copy + error-state tweak (header tagline, friendly retry pill).

## Files to add

None.

## Technical details

- Use `@ai-sdk/openai-compatible` + `ai`'s `generateText` (already wired via `src/lib/ai-gateway.ts`) and the gateway helper pattern; default model `google/gemini-2.5-flash-lite` (cheapest tier, maximizes effective prompt count on the workspace's credit pool).
- Tool-context budget: cap injected packet at ~6 KB so we don't blow up token cost.
- Intent detection is reused only to decide **which tools to pre-call** for context — not to gate the response. Free-form questions get a lightweight macro+fear/greed context.
- UI actions: the model returns a final JSON block `{"ui_action": {...}}` parsed out of the assistant message; if missing, `ui_action` is `null`.
- Fallback path is identical to today's behavior, so the worst case is "current quality" — never worse.
- No new env vars; uses existing `LOVABLE_API_KEY`.

## Risk / honesty note

"Unlimited prompts" via app code is impossible — the gateway enforces credits server-side. What this plan guarantees is that the **user never sees** a credit/payment error: on gateway refusal the deterministic engine answers instead, using the same formulas, so the chat keeps working forever.
