"use server";

import { resolveAndSummarize, type CalibrationView } from "@/calibration/resolve-predictions";
import { recordPrediction } from "@/calibration/prediction-store";
import { visitorId } from "@/calibration/visitor-cookie";
import type { Direction } from "@/calibration/brier";
import { resolveSnapshot } from "@/market/snapshot-source";
import { addTradingSessions } from "@/engine/trading-calendar";
import {
  MAX_UNSETTLED_PREDICTIONS,
  atUnsettledLimit,
  unsettledLimitMessage,
} from "@/limits/request-limits";
import { HORIZON_SESSIONS } from "@/calibration/prediction-store";

/**
 * Calibration practice mode. Entirely separate from the six checks and the
 * legal copy, which it must not touch.
 */

export type CalibrationResponse =
  | { ok: true; view: CalibrationView; message?: string }
  | { ok: false; error: string };

function isDirection(value: string): value is Direction {
  return value === "up" || value === "down";
}

async function viewFor(symbol: string): Promise<CalibrationResponse> {
  const snapshot = await resolveSnapshot(symbol);
  if (!snapshot.ok) return { ok: false, error: snapshot.reason };
  const id = await visitorId();
  return {
    ok: true,
    view: resolveAndSummarize(id, symbol, snapshot.value.snapshot.bars),
  };
}

export async function loadCalibration(
  symbol: string,
): Promise<CalibrationResponse> {
  return viewFor(symbol.trim().toUpperCase());
}

export async function submitPrediction(
  _previous: CalibrationResponse | null,
  form: FormData,
): Promise<CalibrationResponse> {
  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase();
  const direction = String(form.get("direction") ?? "");
  const confidence = Number(form.get("confidence")) / 100;

  if (!isDirection(direction)) {
    return { ok: false, error: "Choose whether the close will be higher or lower." };
  }
  if (!(confidence >= 0.5 && confidence <= 1)) {
    return { ok: false, error: "Confidence must be between 50% and 100%." };
  }

  const snapshot = await resolveSnapshot(symbol);
  if (!snapshot.ok) return { ok: false, error: snapshot.reason };
  const { asOf, bars } = snapshot.value.snapshot;
  if (!asOf || bars.length === 0) {
    return { ok: false, error: "No price history is loaded to forecast against." };
  }

  const id = await visitorId();

  // A visitor may hold only so many forecasts waiting to settle (v1.1 D8), so
  // the table cannot be grown without bound from one cookie.
  const view = resolveAndSummarize(id, symbol, bars);
  if (atUnsettledLimit(view.pending)) {
    return {
      ok: false,
      error: unsettledLimitMessage(MAX_UNSETTLED_PREDICTIONS),
    };
  }

  const resolveAfter = addTradingSessions(asOf, HORIZON_SESSIONS);
  recordPrediction({
    visitorId: id,
    symbol,
    direction,
    confidence,
    resolveAfter,
    baseClose: bars[bars.length - 1].close,
  });

  return {
    ok: true,
    view: resolveAndSummarize(id, symbol, bars),
    message: `Recorded: ${direction} from the ${asOf} close at ${Math.round(
      confidence * 100,
    )}% confidence. Settles on or after ${resolveAfter}.`,
  };
}
