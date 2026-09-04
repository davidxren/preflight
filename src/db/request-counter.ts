import { db } from "./client";
import { requests } from "./schema";

/**
 * The request counter (CLAUDE.md §10, owner amendment 6) — the only analytics
 * this app keeps. It records that a report was built, for which ticker and
 * action, and from which data mode. It records nothing about who asked: no
 * visitor id, no IP address, no sizing input, no user agent.
 *
 * Writing is best-effort by design. Counting is worth less than answering, so
 * a failed write is logged and the report is returned regardless.
 */

export interface RequestRecord {
  symbol: string;
  action: string;
  mode: "sample" | "live";
}

export function recordRequest(record: RequestRecord): void {
  try {
    db()
      .insert(requests)
      .values({
        symbol: record.symbol.toUpperCase(),
        action: record.action,
        mode: record.mode,
      })
      .run();
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error))
      .replace(/\s+/g, " ")
      .slice(0, 160);
    console.warn(`[preflight] request counter unavailable, continuing: ${detail}`);
  }
}

export interface Tally {
  key: string;
  count: number;
}

export interface RequestCounts {
  total: number;
  byMode: Tally[];
  bySymbol: Tally[];
  byAction: Tally[];
  firstAt: number | null;
  lastAt: number | null;
}

/** Counts grouped by one column, most frequent first. */
function tally(column: "mode" | "symbol" | "action"): Tally[] {
  return db()
    .$client.prepare(
      `SELECT ${column} AS key, COUNT(*) AS count FROM requests
       GROUP BY ${column} ORDER BY count DESC, key ASC`,
    )
    .all() as Tally[];
}

/** Reads the counter. Never writes, so `--stats` leaves no trace of itself. */
export function requestCounts(): RequestCounts {
  const client = db().$client;
  const total = (
    client.prepare("SELECT COUNT(*) AS c FROM requests").get() as { c: number }
  ).c;
  const range = client
    .prepare("SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM requests")
    .get() as { first: number | null; last: number | null };

  return {
    total,
    byMode: tally("mode"),
    bySymbol: tally("symbol"),
    byAction: tally("action"),
    firstAt: range.first,
    lastAt: range.last,
  };
}
