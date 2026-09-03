# Preflight — project memory

Ground truth for every session. Loaded at session start; survives compaction.

Preflight is a Next.js app: user enters a **ticker** + an **intended action**
(`buy shares` / `buy call` / `buy put`) and receives six impersonal,
evidence-based situational checks with citations — never a buy/sell verdict.

## §2 Hard rules (never violate)

1. **Never fabricate a number.** If any input field is missing/unreachable, render exactly `Data unavailable` for that field with a one-line reason. Never estimate, interpolate, or invent.
2. **No verdicts, scores, grades, ratings, or recommendations** anywhere — UI, copy, LLM output, or CLI.
3. **No user-account data.** No auth, no PII, no persistence of user-entered sizing numbers (check 4 inputs live in memory only).
4. **The LLM explainer may rephrase but must NEVER produce, alter, or infer a number.** All numbers come from the deterministic engine. If the model returns any digit not present in the engine payload, discard its output and fall back to the deterministic template.
5. **Citations are fixed** (see Fixed citations). Do not reword or re-source them.
6. **Macro dates are embedded** (`src/data/macro.ts`). Use them verbatim; do NOT fetch macro dates at runtime.
7. **Legal copy is verbatim and protected** (see Legal disclaimer). Never edit, shorten, or relocate it off the report.
8. **The test harness is sacred.** Never edit, weaken, skip, or delete a test to make it pass. Fix the code.

## §3 Non-goals (do not build)

No authentication, no payments, no broker APIs, no order placement, no real-time
streaming, no X/Reddit/news APIs, no scraping, no backtester, no price
predictions, no "AI score", no mobile-specific UI, no dark mode, no redesign of
the aviation-checklist aesthetic (paper white, near-black ink, single amber
accent `#B45309`, tabular numerals, sentence case, no gradients, no emoji,
no charts).

## §19 Craft standards

Domain-named modules (no `utils` dumping ground); no dead code; no bare `catch`
(log or handle with reason); comments explain **why**, not what; type
annotations on all exported functions; ~300-line module ceiling — if exceeded,
justify in the report; commits chunked one-per-deliverable and independently
revertable.

## Fixed citations (§5) — verbatim strings for the app

- **Check 1 —** de Silva, Smith & So, "Losing is Optional: Retail Option Trading and Expected Announcement Volatility," *Review of Finance* 30(2), Mar 2026, pp. 489–535, doi:10.1093/rof/rfaf052. "Retail losses of 5-to-9% on average, and 10-to-14% for high expected volatility announcements."
- **Check 2 —** Bryzgalova, Pavlova & Sikorskaya, "Retail Trading in Options and the Rise of the Big Three Wholesalers," *Journal of Finance* 78(6), 2023, pp. 3465–3514, doi:10.1111/jofi.13285. "Weekly options average bid-ask spread of 12.6%"; aggregate retail options losses of $2.1 billion, Nov 2019–Jun 2021.
- **Check 3 —** Barber, Huang, Odean & Schwarz, "Attention-Induced Trading and Returns: Evidence from Robinhood Users," *Journal of Finance* 77(6), 2022, pp. 3141–3190, doi:10.1111/jofi.13183. "Average 20-day abnormal returns are −4.7% for the top stocks purchased each day."
- **Check 4 —** Chague, De-Losso & Giovannetti, "Day Trading for a Living?" SSRN 3423101, 2020. Of 1,551 who persisted 300+ days, "97% of them lost money, only 0.4% earned more than a bank teller."

## Legal disclaimer (§6) — verbatim, shown on every report; protected

> Preflight is an educational tool. It shows publicly documented statistics about market situations. It does not know your finances, does not give investment advice, and does not recommend any transaction. Nothing here is a solicitation to buy or sell any security. Trading involves substantial risk of loss.

## Banned phrases (§7) — must not appear anywhere in the app or copy

"beat the market", "edge", "win rate" (allowed ONLY as the labeled input field
in the check-4 sizing calculator), "AI-powered predictions",
"stop losing money". A Vitest test greps the source/routes for these.

## The six checks (fixed scope — do not add, remove, or reinterpret)

1. Earnings proximity + implied move (nearest-expiry ATM straddle mid ÷ spot).
2. Options bid-ask spread drag: (ask − bid) ÷ mid, as %.
3. Top-mover / chasing flag.
4. Position-sizing / risk-of-ruin math on hypothetical inputs (never persisted).
5. Honest pattern base rates from ~10y daily OHLC (five hand-rolled detectors).
6. Macro-event proximity (FOMC/CPI/jobs within 3 trading days, embedded data).

## Owner amendments to the contract

These were ruled by the owner and override the original spec.

1. **Persistence is exactly three tables** (was two): `cache`, `waitlist`,
   `predictions`. `predictions` may hold exactly these nine columns and
   nothing else (amendment 3 fixes the list to these literal names):

       base_close, confidence, created_at, direction, id,
       outcome, resolve_after, symbol, visitor_id

   No emails, no sizing inputs, nothing else. A test asserts the table list,
   and asserts the column list against this literal enumeration.
2. **Stooq is removed from the OHLC fallback slot.** The price-history
   fallback is Tiingo end-of-day, gated on `TIINGO_API_KEY`, with the same
   try/one-retry/cache rules and the same honest failure reporting. With no
   key the behaviour is `Data unavailable` plus the reason.
3. **`base_close` is a permitted column and the column list is pinned
   literally.** `base_close` is a public market price and the reference a
   forecast is settled against; calibration mode cannot resolve without it,
   and it is not personal data. Amendment 1's enumeration above is the
   contract, copied verbatim into `tests/calibration.test.ts`; the test
   compares the live schema against that literal list rather than against a
   list read back from the implemented schema, so schema drift fails the
   test. This corrects a test by owner ruling; it does not weaken one.
   (The ruling was issued as "ten columns" on the strength of a miscount in
   the session-1 state report. The table has nine columns; `base_close` is
   one of the nine, not a tenth. The substance of the ruling is unchanged.)
4. **One DOM test environment is approved**, devDependency only, for the
   page-level disclaimer assertion and the server-action tests. Scope is
   exactly those tests: no snapshot tests and no component-by-component
   coverage.
5. **Check 5 reports uncertainty.** This is the only sanctioned change to
   check 5's output; the five detector definitions stay verbatim. Every
   median and every difference against the unconditional median carries a
   95% interval from a stationary block bootstrap (Politis & Romano 1994)
   over relative bars — geometric blocks averaging 20 sessions, 2,000
   resamples, fixed seed. Alongside N, each horizon shows the count of
   non-overlapping occurrences, and the small-sample warning keys off that
   count rather than N. The ten statistics per ticker carry a
   Benjamini-Hochberg adjustment at a 5% false-discovery rate, disclosed in
   one sentence. Where the pattern is absent from more than 5% of resamples,
   both intervals render `Data unavailable` with that reason.

## Ask-vs-decide

Decide small implementation details; log every decision. STOP and ask before:
adding any paid API; adding any new top-level dependency beyond the pinned
stack; changing any of the six checks; altering legal copy; adding
auth/payments; or persisting sizing inputs.
