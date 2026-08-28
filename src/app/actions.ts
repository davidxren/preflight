"use server";

import { toIsoDate } from "@/engine/calendar";
import { buildReport } from "@/engine/report";
import { isTradeAction, type Report, type SizingInputs } from "@/engine/types";
import { resolveSnapshot } from "@/market/snapshot-source";

/**
 * Server actions. Every input arriving here is untrusted, so the ticker and
 * action are validated before any lookup. Sizing numbers are passed straight
 * into the engine and are never written anywhere (CLAUDE.md §2.3).
 */

export interface ReportRequest {
  symbol: string;
  action: string;
  sizing?: SizingInputs | null;
}

export type ReportResponse =
  | { ok: true; report: Report }
  | { ok: false; error: string };

/** Tickers are 1-6 letters, optionally with a class suffix such as BRK.B. */
const TICKER = /^[A-Za-z]{1,6}(?:[.-][A-Za-z]{1,2})?$/;

export async function createReport({
  symbol,
  action,
  sizing = null,
}: ReportRequest): Promise<ReportResponse> {
  const ticker = symbol.trim().toUpperCase();
  if (!TICKER.test(ticker)) {
    return { ok: false, error: `"${symbol}" is not a ticker symbol.` };
  }
  if (!isTradeAction(action)) {
    return {
      ok: false,
      error: `"${action}" is not one of: buy shares, buy call, buy put.`,
    };
  }

  const snapshot = await resolveSnapshot(ticker);
  if (!snapshot.ok) return { ok: false, error: snapshot.reason };

  return {
    ok: true,
    report: buildReport({
      snapshot: snapshot.value,
      action,
      today: toIsoDate(new Date()),
      sizing,
    }),
  };
}
