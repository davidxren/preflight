/**
 * Preflight command-line harness.
 *
 *   npx tsx scripts/preflight-cli.ts AAPL "buy call"
 *   npx tsx scripts/preflight-cli.ts TSLA "buy shares" --json
 *   PREFLIGHT_DATA=live npx tsx scripts/preflight-cli.ts SPY "buy shares"
 *
 * Runs the same engine the web report uses, so the terminal and the page can
 * never disagree about a figure. In --json mode stdout carries only the JSON
 * document; warnings and the gate G1 line go to stderr.
 */
import { pathToFileURL } from "node:url";
import { toIsoDate } from "@/engine/calendar";
import { buildReport } from "@/engine/report";
import { renderReportText } from "@/engine/report-text";
import { explainReport } from "@/explainer/explain-report";
import {
  isTradeAction,
  TRADE_ACTIONS,
  type SizingInputs,
  type TradeAction,
} from "@/engine/types";
import {
  GATE_G1_FAILED,
  dataMode,
  resolveSnapshot,
  type DataMode,
} from "@/market/snapshot-source";

const USAGE = `Usage: preflight-cli <TICKER> "<action>" [options]

Actions: ${TRADE_ACTIONS.join(", ")}

Options:
  --json                 Emit the report as JSON on stdout, nothing else.
  --date=YYYY-MM-DD      Build the report for this date (default: today).
  --help                 Show this message.

Check 4 sizing (all five required together; fractions, not percentages):
  --equity=10000         Account equity.
  --risk=0.02            Fraction of equity risked per trade.
  --win-prob=0.5         Probability a trade wins, 0 to 1.
  --payoff=2             Average win divided by average loss.
  --budget=0.5           Fraction of equity whose loss counts as ruin.

Data mode is chosen by PREFLIGHT_DATA: "live" opts in, anything else uses the
committed sample fixtures. Sizing numbers are never stored.`;

class UsageError extends Error {}

interface CliArgs {
  symbol: string;
  action: TradeAction;
  today: string;
  json: boolean;
  sizing: SizingInputs | null;
}

const SIZING_FLAGS = ["equity", "risk", "win-prob", "payoff", "budget"] as const;
type SizingFlag = (typeof SIZING_FLAGS)[number];

function requireNumber(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError(`--${flag} needs a number, got "${raw}".`);
  }
  return value;
}

/**
 * Sizing is all-or-nothing: defaulting a missing number would put a figure on
 * the report that the operator never supplied.
 */
function readSizing(values: Partial<Record<SizingFlag, number>>): SizingInputs | null {
  const provided = SIZING_FLAGS.filter((f) => values[f] !== undefined);
  if (provided.length === 0) return null;
  if (provided.length !== SIZING_FLAGS.length) {
    const missing = SIZING_FLAGS.filter((f) => values[f] === undefined);
    throw new UsageError(
      `Check 4 needs all five sizing flags. Missing: ${missing
        .map((f) => `--${f}`)
        .join(", ")}.`,
    );
  }
  return {
    equity: values.equity as number,
    riskFraction: values.risk as number,
    winProbability: values["win-prob"] as number,
    payoffRatio: values.payoff as number,
    riskBudgetFraction: values.budget as number,
  };
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  const sizing: Partial<Record<SizingFlag, number>> = {};
  let today = toIsoDate(new Date());
  let json = false;

  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const [flag, raw] = arg.slice(2).split("=", 2);
      if (raw === undefined) {
        throw new UsageError(`--${flag} needs a value, written --${flag}=value.`);
      }
      if (flag === "date") {
        today = raw;
        continue;
      }
      if ((SIZING_FLAGS as readonly string[]).includes(flag)) {
        sizing[flag as SizingFlag] = requireNumber(flag, raw);
        continue;
      }
      throw new UsageError(`Unknown option --${flag}.`);
    }
    positional.push(arg);
  }

  const [symbol, action] = positional;
  if (!symbol) throw new UsageError("A ticker symbol is required.");
  if (!action) throw new UsageError("An action is required.");
  if (!isTradeAction(action)) {
    throw new UsageError(`"${action}" is not one of: ${TRADE_ACTIONS.join(", ")}.`);
  }
  if (positional.length > 2) {
    throw new UsageError(`Unexpected argument "${positional[2]}".`);
  }

  return {
    symbol: symbol.toUpperCase(),
    action,
    today,
    json,
    sizing: readSizing(sizing),
  };
}

/** An explicit request for help is not an error, so it exits zero. */
function wantsHelp(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

async function main(): Promise<void> {
  if (wantsHelp(process.argv.slice(2))) {
    console.log(USAGE);
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const requested: DataMode = dataMode();
  const resolved = await resolveSnapshot(args.symbol, requested);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exitCode = 1;
    return;
  }

  // Gate G1: the exact line is part of the contract. It goes to stderr so that
  // --json output stays a single parsable document.
  if (resolved.value.gateFailure) {
    console.error(GATE_G1_FAILED);
    console.error(`Reason: ${resolved.value.gateFailure}`);
    console.error("Continuing in sample mode.\n");
  }

  const report = await explainReport(
    buildReport({
      snapshot: resolved.value.snapshot,
      action: args.action,
      today: args.today,
      sizing: args.sizing,
    }),
  );

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          requestedMode: requested,
          mode: resolved.value.mode,
          gateFailure: resolved.value.gateFailure ?? null,
          report,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(renderReportText(report));
}

function reportFailure(error: unknown): void {
  if (error instanceof UsageError) {
    if (error.message) console.error(`${error.message}\n`);
    console.error(USAGE);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}

// Only run when invoked directly; the tests import parseArgs from this module
// and importing must not execute the command.
const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (entryPoint === import.meta.url) {
  main().catch(reportFailure);
}
