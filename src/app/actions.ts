"use server";

import { joinWaitlist } from "@/db/waitlist-store";
import { toIsoDate } from "@/engine/calendar";
import { buildReport } from "@/engine/report";
import { isTradeAction, type Report, type SizingInputs } from "@/engine/types";
import { resolveSnapshot } from "@/market/snapshot-source";

/**
 * Server actions. Everything arriving here is untrusted, so the ticker, the
 * action, and the sizing numbers are validated before use. Sizing numbers are
 * passed into the engine and never written anywhere (CLAUDE.md §2.3).
 */

export type ReportResponse =
  | { ok: true; report: Report; gateFailure?: string }
  | { ok: false; error: string };

/** Tickers are 1-6 letters, optionally with a class suffix such as BRK.B. */
const TICKER = /^[A-Za-z]{1,6}(?:[.-][A-Za-z]{1,2})?$/;

export async function createReport(
  symbol: string,
  action: string,
  sizing: SizingInputs | null = null,
): Promise<ReportResponse> {
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

  const resolved = await resolveSnapshot(ticker);
  if (!resolved.ok) return { ok: false, error: resolved.reason };

  const report = buildReport({
    snapshot: resolved.value.snapshot,
    action,
    today: toIsoDate(new Date()),
    sizing,
  });

  return { ok: true, report, gateFailure: resolved.value.gateFailure };
}

/** Reads a percentage field as a fraction, or null when left blank. */
function fractionField(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value / 100 : Number.NaN;
}

function numberField(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Sizing is all-or-nothing: a half-filled form would otherwise silently
 * default the missing numbers, which is the one thing this app must not do.
 */
function readSizing(form: FormData): SizingInputs | null {
  const equity = numberField(form, "equity");
  const riskFraction = fractionField(form, "riskPerTrade");
  const winProbability = fractionField(form, "winRate");
  const payoffRatio = numberField(form, "payoffRatio");
  const riskBudgetFraction = fractionField(form, "riskBudget");
  const values = [equity, riskFraction, winProbability, payoffRatio, riskBudgetFraction];
  if (values.every((v) => v === null)) return null;
  return {
    equity: equity ?? Number.NaN,
    riskFraction: riskFraction ?? Number.NaN,
    winProbability: winProbability ?? Number.NaN,
    payoffRatio: payoffRatio ?? Number.NaN,
    riskBudgetFraction: riskBudgetFraction ?? Number.NaN,
  };
}

export async function submitReport(
  _previous: ReportResponse | null,
  form: FormData,
): Promise<ReportResponse> {
  return createReport(
    String(form.get("symbol") ?? ""),
    String(form.get("action") ?? ""),
    readSizing(form),
  );
}

export type WaitlistResponse =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function submitWaitlist(
  _previous: WaitlistResponse | null,
  form: FormData,
): Promise<WaitlistResponse> {
  const result = joinWaitlist(String(form.get("email") ?? ""));
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: result.alreadyJoined
      ? "That address is already on the list."
      : "Added to the list.",
  };
}
