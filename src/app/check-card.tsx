import { DATA_UNAVAILABLE } from "@/engine/disclaimer";
import type { CheckResult, Figure } from "@/engine/types";

/**
 * One check, rendered as a panel on the checklist. Figures are tabular and
 * right-aligned so they read down the page as a column of numbers.
 */

function FigureRow({ figure }: { figure: Figure }): React.ReactElement {
  const missing = figure.value === DATA_UNAVAILABLE;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline gap-2">
        <dt className="text-sm text-ink-muted">{figure.label}</dt>
        <span
          aria-hidden="true"
          className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-rule-strong"
        />
        <dd
          className={`figure shrink-0 text-sm ${
            missing ? "text-amber" : "text-ink"
          }`}
        >
          {figure.value}
        </dd>
      </div>
      {missing && figure.reason ? (
        <p className="mt-1 max-w-prose text-xs text-ink-faint">{figure.reason}</p>
      ) : null}
    </div>
  );
}

export function CheckCard({ check }: { check: CheckResult }): React.ReactElement {
  return (
    <article className="border border-rule-strong bg-panel">
      <header className="flex items-baseline gap-3 border-b border-rule px-5 py-3">
        <span className="figure text-xs text-amber">
          {String(check.number).padStart(2, "0")}
        </span>
        <h3 className="text-base font-semibold tracking-tight">{check.title}</h3>
      </header>

      <div className="px-5 py-4">
        <p className="max-w-prose text-sm leading-relaxed">{check.summary}</p>

        <dl className="mt-4 divide-y divide-rule border-t border-rule">
          {check.figures.map((figure, i) => (
            <FigureRow key={`${figure.label}-${i}`} figure={figure} />
          ))}
        </dl>

        {check.notes.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-rule pt-4">
            {check.notes.map((note, i) => (
              <li key={i} className="max-w-prose text-xs leading-relaxed text-ink-muted">
                {note}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-4 max-w-prose border-t border-rule pt-3 text-xs leading-relaxed text-ink-faint">
          <span className="uppercase tracking-widest text-amber">Source </span>
          {check.citation}
        </p>
      </div>
    </article>
  );
}
