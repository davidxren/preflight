# Preflight

Enter a ticker and the action you are considering. Preflight returns **six
impersonal, evidence-based situational checks with citations**.

It does not give a verdict, a score, a grade, or a recommendation, and it never
invents a number. When a figure cannot be computed it says `Data unavailable`
and gives the reason.

`CLAUDE.md` holds the project's hard rules and is the ground truth for changes.

## Quick start

```bash
npm install
npm run dev
```

Sample mode is the default and needs **no API keys and no network** — it reads
committed snapshots for AAPL, NVDA, SPY, and TSLA.

## The six checks

| # | Check | Figure |
|---|---|---|
| 1 | Earnings proximity and implied move | Days to earnings; nearest-expiry at-the-money straddle mid ÷ spot |
| 2 | Options bid-ask spread drag | (ask − bid) ÷ mid for the contract the action implies |
| 3 | Top mover and run-up | On the day-gainers screen; trailing returns and their percentile rank |
| 4 | Position sizing and risk of ruin | Kelly fraction; seeded Monte Carlo over 10,000 paths of 50 trades |
| 5 | Pattern base rates | Five hand-rolled detectors over ~10y of daily bars, against the unconditional baseline |
| 6 | Macro-event proximity | FOMC / CPI / jobs releases within 3 NYSE trading days |

Checks 1–4 carry a fixed citation from the literature. Checks 5 and 6 measure
this ticker's own history and a published government calendar, and name those
sources instead.

## Command line

```bash
npx tsx scripts/preflight-cli.ts AAPL "buy call"
```

```bash
npx tsx scripts/preflight-cli.ts TSLA "buy shares" --json
```

Run `npx tsx scripts/preflight-cli.ts --help` for every option. Check 4 needs
all five sizing flags together; those numbers are never stored.

```bash
npx tsx scripts/preflight-cli.ts AAPL "buy call" --equity=10000 --risk=0.02 --win-prob=0.5 --payoff=2 --budget=0.5
```

## Live data (opt-in)

```bash
PREFLIGHT_DATA=live npx tsx scripts/preflight-cli.ts SPY "buy shares"
```

Each field has a primary keyless source and a documented fallback. Gate G1
probes the primary source first; if it is unreachable the run prints
`GATE FAILED: live data unreachable` and continues on sample data.

| Need | Primary | Fallback |
|---|---|---|
| ~10y daily OHLC | yahoo-finance2 `.chart()` | Tiingo end-of-day (`TIINGO_API_KEY`) |
| Options chain bid/ask | yahoo-finance2 `.options()` | Tradier sandbox (`TRADIER_SANDBOX_TOKEN`) |
| Next earnings date | yahoo-finance2 `.quoteSummary()` | Finnhub (`FINNHUB_API_KEY`) |
| Day gainers | yahoo-finance2 `.screener()` | none — renders `Data unavailable` |

Successful live responses are cached in SQLite, because the primary source is
unofficial, rate-limits, and depends on a token that expires within minutes.

Every fallback is gated on its own key. With the key absent, the fallback
reports that plainly and the report renders `Data unavailable` with the
reason — it never substitutes a number of its own.

## Database

```bash
npm run db:migrate
```

Two tables: `cache` (live responses) and `waitlist` (emails). User-entered
sizing numbers are never written anywhere.

## Explainer (optional)

If `ANTHROPIC_API_KEY` is set, the report's plain-language summary is
rephrased by `claude-haiku-4-5`. Every number in the model's prose is checked
against the figures the engine computed; if it introduces any other number the
output is discarded and the deterministic template stands. With no key the
template is used and that is not an error.

## Environment

| Variable | Effect |
|---|---|
| `PREFLIGHT_DATA` | `live` opts into live data; anything else is sample mode |
| `PREFLIGHT_DB_PATH` | SQLite file (default `./preflight.db`) |
| `PREFLIGHT_PROBE_URL` | Overrides the gate G1 probe, to exercise its failure path |
| `TIINGO_API_KEY` | Price-history fallback |
| `TRADIER_SANDBOX_TOKEN` | Options fallback |
| `FINNHUB_API_KEY` | Earnings fallback |
| `ANTHROPIC_API_KEY` | Enables the explainer |

## Development

```bash
npm test
```

```bash
npm run build
```

Fixtures are captured snapshots, regenerated with
`npx tsx scripts/build-fixtures.ts`. The committed JSON is what sample mode
reads; the app itself never calls the network in sample mode.
