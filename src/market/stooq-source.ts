import { failed, ok, reasonFrom, type Fetched } from "./fetched";
import type { DailyBar } from "./types";

/**
 * Keyless OHLC fallback (CLAUDE.md §9). Stooq serves plain CSV when it serves
 * anything at all; as of this build it often answers with a JavaScript
 * browser-verification challenge instead. That challenge is bot detection and
 * is not worked around here — the fetch reports it and the report renders
 * `Data unavailable` with the reason.
 */

const CSV_HEADER = "Date,Open,High,Low,Close,Volume";
const TIMEOUT_MS = 15_000;

export function stooqUrl(symbol: string): string {
  return `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`;
}

/** Parses Stooq's daily CSV. Rows with any non-numeric field are dropped. */
export function parseStooqCsv(csv: string, fromIsoDate: string): Fetched<DailyBar[]> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0 || !lines[0].startsWith(CSV_HEADER)) {
    if (/<html|<script|javascript/i.test(csv)) {
      return failed(
        "Stooq answered with a browser-verification challenge instead of CSV.",
      );
    }
    return failed("Stooq response was not the expected daily CSV.");
  }

  const bars: DailyBar[] = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close, volume] = line.split(",");
    if (!date || date < fromIsoDate) continue;
    const values = [open, high, low, close].map(Number);
    if (values.some((v) => !Number.isFinite(v))) continue;
    bars.push({
      date,
      open: values[0],
      high: values[1],
      low: values[2],
      close: values[3],
      volume: Number.isFinite(Number(volume)) ? Number(volume) : 0,
    });
  }
  if (bars.length === 0) return failed("Stooq CSV carried no usable rows.");
  return ok(bars);
}

export async function fetchStooqBars(
  symbol: string,
  fromIsoDate: string,
): Promise<Fetched<DailyBar[]>> {
  try {
    const response = await fetch(stooqUrl(symbol), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      return failed(`Stooq returned HTTP ${response.status}.`);
    }
    return parseStooqCsv(await response.text(), fromIsoDate);
  } catch (error) {
    return failed(reasonFrom(error, "Stooq unreachable"));
  }
}
