import { CheckCard } from "./check-card";
import { DATA_UNAVAILABLE } from "@/engine/disclaimer";
import type { Report } from "@/engine/types";

/** The assembled report: header strip, the six cards, then the prose summary. */
export function ReportView({
  report,
  gateFailure,
}: {
  report: Report;
  gateFailure?: string;
}): React.ReactElement {
  return (
    <section aria-label={`Preflight checks for ${report.symbol}`} className="mt-10">
      <header className="border border-rule-strong bg-panel px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="figure text-xl font-semibold tracking-tight">
            {report.symbol}
          </h2>
          <span className="text-sm text-ink-muted">{report.action}</span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-ink-muted sm:grid-cols-3">
          <div className="flex gap-2">
            <dt>Report date</dt>
            <dd className="figure text-ink">{report.today}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Market data as of</dt>
            <dd className="figure text-ink">{report.asOf ?? DATA_UNAVAILABLE}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Data source</dt>
            <dd className="text-ink">{report.source}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-faint">{report.provenance}</p>
        {gateFailure ? (
          <p className="mt-3 border-t border-rule pt-3 text-xs text-amber">
            Live data was requested but the source was unreachable
            ({gateFailure}). These figures come from the sample snapshot.
          </p>
        ) : null}
      </header>

      <div className="mt-4 space-y-4">
        {report.checks.map((check) => (
          <CheckCard key={check.number} check={check} />
        ))}
      </div>

      <section className="mt-4 border border-rule-strong bg-panel px-5 py-4">
        <h3 className="text-xs uppercase tracking-widest text-amber">
          Plain-language summary
        </h3>
        <div className="mt-3 space-y-2">
          {report.explanation.text.split("\n").map((line, i) => (
            <p key={i} className="max-w-prose text-sm leading-relaxed">
              {line}
            </p>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          Written by the {report.explanation.origin === "model" ? "model" : "built-in template"}.
          Every number comes from the checks above.
          {report.explanation.fallbackReason
            ? ` ${report.explanation.fallbackReason}`
            : ""}
        </p>
      </section>
    </section>
  );
}
