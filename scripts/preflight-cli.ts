/**
 * Preflight command-line harness.
 *
 *   npx tsx scripts/preflight-cli.ts AAPL "buy call"
 *
 * Runs the same engine the web report uses, so the terminal and the page can
 * never disagree about a figure.
 */
import { toIsoDate } from "@/engine/calendar";
import { buildReport } from "@/engine/report";
import { renderReportText } from "@/engine/report-text";
import { isTradeAction, TRADE_ACTIONS, type TradeAction } from "@/engine/types";
import { GATE_G1_FAILED, dataMode, resolveSnapshot } from "@/market/snapshot-source";

interface CliArgs {
  symbol: string;
  action: TradeAction;
  today: string;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): CliArgs {
  const positional: string[] = [];
  let today = toIsoDate(new Date());

  for (const arg of argv) {
    if (arg.startsWith("--date=")) {
      today = arg.slice("--date=".length);
      continue;
    }
    if (arg.startsWith("--")) throw new UsageError(`Unknown option ${arg}`);
    positional.push(arg);
  }

  const [symbol, action] = positional;
  if (!symbol) throw new UsageError("A ticker symbol is required.");
  if (!action) throw new UsageError("An action is required.");
  if (!isTradeAction(action)) {
    throw new UsageError(
      `"${action}" is not one of: ${TRADE_ACTIONS.join(", ")}.`,
    );
  }
  return { symbol: symbol.toUpperCase(), action, today };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const resolved = await resolveSnapshot(args.symbol, dataMode());
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exitCode = 1;
    return;
  }
  // Gate G1: the exact line is part of the contract, so it is printed before
  // anything else and the run continues on sample data.
  if (resolved.value.gateFailure) {
    console.error(GATE_G1_FAILED);
    console.error(`Reason: ${resolved.value.gateFailure}`);
    console.error("Continuing in sample mode.\n");
  }
  const report = buildReport({
    snapshot: resolved.value.snapshot,
    action: args.action,
    today: args.today,
  });
  console.log(renderReportText(report));
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n`);
    console.error('Usage: preflight-cli <TICKER> "<buy shares|buy call|buy put>"');
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
