"use client";

import { useActionState } from "react";
import { submitReport, type ReportResponse } from "./actions";
import { Field, INPUT_CLASS } from "./field";
import { ReportView } from "./report-view";
import { SizingFields } from "./sizing-fields";
import { TRADE_ACTIONS } from "@/engine/types";

/**
 * The single form on the page: a ticker, an intended action, and the optional
 * sizing numbers for check 4.
 */
export function ReportForm({
  sampleSymbols,
}: {
  sampleSymbols: readonly string[];
}): React.ReactElement {
  const [state, formAction, pending] = useActionState<ReportResponse | null, FormData>(
    submitReport,
    null,
  );

  return (
    <>
      <form action={formAction} className="border border-rule-strong bg-panel p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ticker" hint={`Sample data ships for ${sampleSymbols.join(", ")}`}>
            <input
              className={`${INPUT_CLASS} uppercase`}
              name="symbol"
              required
              autoComplete="off"
              spellCheck={false}
              maxLength={9}
              placeholder="NVDA"
            />
          </Field>
          <Field label="Intended action">
            <select className={INPUT_CLASS} name="action" defaultValue="buy shares">
              {TRADE_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <SizingFields />

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-rule pt-5">
          <button
            type="submit"
            disabled={pending}
            className="border border-ink bg-ink px-5 py-2 text-sm text-paper disabled:opacity-50"
          >
            {pending ? "Running checks…" : "Run checks"}
          </button>
          <p aria-live="polite" className="text-sm text-amber">
            {state && !state.ok ? state.error : ""}
          </p>
        </div>
      </form>

      {state?.ok ? (
        <ReportView report={state.report} gateFailure={state.gateFailure} />
      ) : null}
    </>
  );
}
