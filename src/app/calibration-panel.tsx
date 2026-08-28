"use client";

import { useActionState, useState } from "react";
import { submitPrediction, type CalibrationResponse } from "./calibration-actions";
import { DATA_UNAVAILABLE } from "@/engine/disclaimer";

/**
 * Calibration practice: the reader forecasts the next five sessions and the
 * page scores their own forecasting record over time. It reports nothing
 * about the ticker and sits outside the six checks.
 */

function figure(value: number | null, decimals: number = 3): string {
  return value === null ? DATA_UNAVAILABLE : value.toFixed(decimals);
}

export function CalibrationPanel({
  symbol,
  asOf,
}: {
  symbol: string;
  asOf: string | null;
}): React.ReactElement {
  const [state, formAction, pending] = useActionState<
    CalibrationResponse | null,
    FormData
  >(submitPrediction, null);
  const [confidence, setConfidence] = useState(60);
  const view = state?.ok ? state.view : null;

  return (
    <section className="mt-4 border border-rule-strong bg-panel px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xs uppercase tracking-widest text-amber">
          Calibration practice
        </h3>
        <p className="text-xs text-ink-faint">Optional. Scores you, not the ticker.</p>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Call the direction of {symbol} five sessions after the{" "}
        {asOf ?? DATA_UNAVAILABLE} close. Forecasts settle on their own once the
        loaded price history covers the window.
      </p>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="symbol" value={symbol} />
        <fieldset className="flex flex-wrap items-center gap-5">
          <legend className="sr-only">Direction</legend>
          {(["up", "down"] as const).map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input type="radio" name="direction" value={d} defaultChecked={d === "up"} />
              {d === "up" ? "Higher" : "Lower"}
            </label>
          ))}
        </fieldset>

        <label className="mt-4 block">
          <span className="block text-xs uppercase tracking-widest text-ink-muted">
            Confidence
          </span>
          <span className="mt-2 flex items-center gap-3">
            <input
              type="range"
              name="confidence"
              min={50}
              max={100}
              step={1}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="max-w-xs flex-1 accent-amber"
            />
            <span className="figure w-14 text-sm">{confidence}%</span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="border border-ink px-5 py-2 text-sm text-ink disabled:opacity-50"
          >
            {pending ? "Recording…" : "Record forecast"}
          </button>
          <p aria-live="polite" className="text-sm text-ink-muted">
            {state ? (state.ok ? (state.message ?? "") : state.error) : ""}
          </p>
        </div>
      </form>

      {view ? (
        <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-rule pt-4 text-sm sm:grid-cols-2">
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-muted">Forecasts settled</dt>
            <dd className="figure">{view.resolved}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-muted">Awaiting their window</dt>
            <dd className="figure">{view.pending}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-muted">Brier score</dt>
            <dd className="figure">{figure(view.brierScore)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-ink-muted">Base-rate Brier</dt>
            <dd className="figure">{figure(view.baseRateBrier)}</dd>
          </div>
          <p className="mt-1 max-w-prose text-xs text-ink-faint sm:col-span-2">
            Lower is closer. The base-rate figure is what always forecasting the
            observed frequency would have scored on the same settled forecasts.
          </p>
        </dl>
      ) : null}
    </section>
  );
}
