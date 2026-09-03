import Link from "next/link";

/**
 * The report's fixed header. Kept apart from the page so the CLI-facing copy
 * and the web copy stay in one place as the report grows.
 */
export function Masthead(): React.ReactElement {
  return (
    <header className="border-b border-rule-strong bg-panel">
      <div className="mx-auto flex max-w-3xl flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">Preflight</span>
        <span className="text-sm text-ink-muted">
          Situational checks before a trade
        </span>
        <Link
          href="/methodology"
          className="ml-auto text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Methodology
        </Link>
        <span className="figure text-xs uppercase tracking-widest text-amber">
          Checklist
        </span>
      </div>
    </header>
  );
}
