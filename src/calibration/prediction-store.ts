import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { predictions, type PredictionRow } from "@/db/schema";
import type { Direction } from "./brier";

/**
 * Storage for calibration forecasts. The only identifier is an anonymous
 * cookie id: there is no account, no email, and nothing that links a forecast
 * to a person (CLAUDE.md §2.3, §10 as amended).
 */

/** The horizon the practice mode forecasts, fixed so scores are comparable. */
export const HORIZON_SESSIONS = 5;

export interface NewPrediction {
  visitorId: string;
  symbol: string;
  direction: Direction;
  confidence: number;
  resolveAfter: string;
  baseClose: number;
}

export function recordPrediction(prediction: NewPrediction): void {
  db().insert(predictions).values(prediction).run();
}

export function predictionsFor(visitorId: string): PredictionRow[] {
  return db()
    .select()
    .from(predictions)
    .where(eq(predictions.visitorId, visitorId))
    .all();
}

export function markResolved(id: number, outcome: Direction): void {
  db().update(predictions).set({ outcome }).where(eq(predictions.id, id)).run();
}
