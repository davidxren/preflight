import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";
import { probePrimarySource } from "@/market/snapshot-source";
import { GATE_G1_FAILED } from "@/market/snapshot-source";

/**
 * Captures raw upstream responses into `tests/fixtures/live/` so that a live
 * call exercised once becomes permanent parser coverage (v1.1 D1). The
 * fixtures are the input to `yahoo-parsers.ts`, which is the boundary the
 * parser tests need; nothing here parses.
 *
 * Only paths that actually answer are written. A path that fails is reported
 * and left uncaptured — an absent fixture is honest, a synthesised one is not.
 */

const OUT_DIR = join(process.cwd(), "tests", "fixtures", "live");

/**
 * Yahoo's chart endpoint is asked for one year rather than the ten the app
 * requests at run time: the parser is window-agnostic and a ten-year capture
 * would add megabytes to the repo for no additional coverage. Recorded here
 * because the fixture is otherwise indistinguishable from a full capture.
 */
const CAPTURE_PERIOD_START = "2025-09-01";

/** Anything key-shaped is removed before a response reaches the repo (rule 10). */
const SECRET_KEY = /token|secret|password|auth|crumb|cookie|apikey|api_key/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[scrubbed]" : scrub(v);
    }
    return out;
  }
  return value;
}

interface Capture {
  name: string;
  call: string;
  note: string;
  run: () => Promise<unknown>;
}

function client(): InstanceType<typeof YahooFinance> {
  return new YahooFinance({ suppressNotices: ["yahooSurvey"] });
}

async function captures(): Promise<Capture[]> {
  const y = client();
  // The dated chain call needs a real expiry, so the expiry list is read first.
  const expiryList = (await y.options("AAPL")) as {
    expirationDates?: (string | number | Date)[];
  };
  const nextExpiry = (expiryList.expirationDates ?? [])[0];

  return [
    {
      name: "chart-aapl",
      call: `chart("AAPL", { period1: "${CAPTURE_PERIOD_START}", interval: "1d" })`,
      note: `One-year window; see CAPTURE_PERIOD_START in scripts/capture-live-fixtures.ts.`,
      run: () =>
        y.chart("AAPL", { period1: CAPTURE_PERIOD_START, interval: "1d" }),
    },
    {
      name: "quote-aapl",
      call: 'quote("AAPL")',
      note: "Equity quote; carries regularMarketPrice and quoteType EQUITY.",
      run: () => y.quote("AAPL"),
    },
    {
      name: "options-aapl-expiries",
      call: 'options("AAPL")',
      note: "Undated call; the expirationDates list the app slices for expiries.",
      run: async () => expiryList,
    },
    {
      name: "options-aapl-chain",
      call: `options("AAPL", { date: ${String(nextExpiry)} })`,
      note: "Nearest dated chain; the calls/puts the at-the-money pair is read from.",
      run: () =>
        nextExpiry
          ? y.options("AAPL", { date: new Date(nextExpiry) })
          : Promise.reject(new Error("no expiry available to request a chain")),
    },
    {
      name: "quote-summary-aapl",
      call: 'quoteSummary("AAPL", { modules: ["calendarEvents"] })',
      note: "Equity with a scheduled earnings date.",
      run: () => y.quoteSummary("AAPL", { modules: ["calendarEvents"] }),
    },
    {
      name: "quote-summary-spy",
      call: 'quoteSummary("SPY", { modules: ["calendarEvents"] })',
      note: "ETF: the no-earnings case the report must state rather than mark unavailable.",
      run: () => y.quoteSummary("SPY", { modules: ["calendarEvents"] }),
    },
    {
      name: "screener-day-gainers",
      call: 'screener({ scrIds: "day_gainers", count: 25 })',
      note: "Day-gainers screen; the only field read is quotes[].symbol.",
      run: () => y.screener({ scrIds: "day_gainers", count: 25 }),
    },
  ];
}

async function main(): Promise<void> {
  const gate = await probePrimarySource();
  if (gate !== null) {
    console.error(`${GATE_G1_FAILED}\nReason: ${gate}`);
    console.error("No fixture was written.");
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const capturedAt = new Date().toISOString();
  let written = 0;
  let skipped = 0;

  for (const capture of await captures()) {
    try {
      const response = await capture.run();
      const document = {
        capture: {
          call: capture.call,
          capturedAt,
          note: capture.note,
          scrubbed: `keys matching ${SECRET_KEY} are replaced with "[scrubbed]"`,
        },
        response: scrub(JSON.parse(JSON.stringify(response))),
      };
      const file = join(OUT_DIR, `${capture.name}.json`);
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
      console.log(`captured ${capture.name} <- ${capture.call}`);
      written += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`NOT captured ${capture.name}: ${detail.slice(0, 200)}`);
      skipped += 1;
    }
  }

  console.log(`\n${written} captured, ${skipped} uncaptured, into ${OUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
