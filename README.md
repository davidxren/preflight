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
| 5 | Pattern base rates | Five hand-rolled detectors over ~10y of daily bars, against the unconditional baseline, each with a bootstrap interval |
| 6 | Macro-event proximity | FOMC / CPI / jobs releases within 3 NYSE trading days |

Checks 1–4 carry a fixed citation from the literature. Checks 5 and 6 measure
this ticker's own history and a published government calendar, and name those
sources instead.

A `/methodology` page states how every check is computed, in plain English,
with the five detector definitions and the fixed citations read straight from
the engine so the page cannot drift from the code.

### Reading check 5

Pattern statistics are easy to over-read, so check 5 states its own
uncertainty:

- Every median and every difference against the unconditional median carries a
  95% interval — the 2.5th and 97.5th percentiles over 2,000 stationary
  block-bootstrap resamples of the series (geometric blocks averaging 20
  sessions), rebuilt into a price path and re-measured with the same detectors.
- Alongside N, each horizon shows how many occurrences are **non-overlapping**.
  Two triggers a few sessions apart share most of a 20-session outcome, so N
  overstates how many independent observations there are. The small-sample
  warning keys off the non-overlapping count.
- Ten statistics are computed per ticker — five detectors at two horizons — so
  they carry a Benjamini–Hochberg adjustment at a 5% false-discovery rate,
  reported in one sentence. It describes the sample and says nothing about
  what happens next.
- Where the pattern is absent from more than 5% of resamples, both intervals
  render `Data unavailable` with that reason rather than describing only the
  resamples that happened to contain it.

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
unofficial, rate-limits, and depends on a token that expires within minutes. A
cache that cannot be read or written (an unmigrated database, say) degrades to
a miss and the run continues on the live fetch.

Every outbound call is bounded: 10 seconds per attempt, and one retry doubles
that at most. The explainer call is bounded at 20 seconds. A call that exceeds
its bound renders `Data unavailable` with the timeout as the reason — it never
hangs the report.

Every fallback is gated on its own key. With the key absent, the fallback
reports that plainly and the report renders `Data unavailable` with the
reason — it never substitutes a number of its own.

## Database

```bash
npm run db:migrate
```

Four tables: `cache` (live responses), `waitlist` (emails), `predictions`
(calibration practice — an anonymous cookie id, the forecast, and its outcome),
and `requests` (the request counter). User-entered sizing numbers are never
written anywhere.

`requests` is the only analytics kept. It records a timestamp, the ticker, the
action and the data mode for each report built from the web app, and nothing
about who asked — no visitor id, no IP address, no user agent. The write is
best-effort and never blocks a report.

```bash
npx tsx scripts/preflight-cli.ts --stats
```

prints the counts. The command line never writes to the counter, so building a
report from a terminal does not change the number and `--stats` only reads.

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

## Deployment

The app keeps its state in SQLite, so it needs a host with a persistent
filesystem. It will not run on a serverless target as written.

```bash
docker build -t preflight .
docker run -p 3000:3000 -v "$PWD/data:/data" preflight
```

The container migrates the database at startup and then serves on port 3000.
It defaults to `PREFLIGHT_DATA=sample` and `PREFLIGHT_DB_PATH=/data/preflight.db`,
so a container given no configuration serves committed snapshots and makes no
network call.

`fly.toml` deploys the same image to Fly.io with a volume mounted at `/data`
and a health check on `/`:

```bash
fly volumes create preflight_data --size 1 --region <region>
fly deploy
```

Keys are set with `fly secrets set NAME=value`. No key is ever baked into the
image, written to the repository, or printed in a log line.

Copy `.env.example` to `.env.local` for local configuration. Node 20 or newer
is required. `.github/workflows/ci.yml` runs the lint, the build, and the test
suite on every push.

## Development

```bash
npm test
```

```bash
npm run build
```

Fixtures are captured snapshots. The committed JSON is what sample mode reads;
the app itself never calls the network in sample mode.

```bash
npm run fixtures:refresh
```

recaptures all four and prints the new as-of date. It checks gate G1 first and
writes nothing unless every symbol captured, so an unreachable source prints
`GATE FAILED: live data unreachable` and leaves the committed fixtures exactly
as they were. A test asserts each snapshot's internal consistency: bars in
order, any earnings date at or after the as-of date, every option expiry
strictly after it, and a recorded reason behind every empty field.

```bash
npm run capture:live
```

captures raw upstream responses into `tests/fixtures/live/`, which the parser
tests read. It writes only what the source actually returns: a path that fails
is reported and left uncaptured rather than synthesised. Key-shaped fields are
replaced with `[scrubbed]` before anything is written.
