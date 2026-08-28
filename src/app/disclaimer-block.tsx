import { LEGAL_DISCLAIMER } from "@/engine/disclaimer";

/**
 * Renders the protected legal copy verbatim (CLAUDE.md §6). The string is
 * imported rather than inlined so there is exactly one copy in the codebase.
 */
export function DisclaimerBlock(): React.ReactElement {
  return (
    <section
      aria-label="Disclaimer"
      className="border-t border-rule-strong bg-amber-wash"
    >
      <div className="mx-auto max-w-3xl px-6 py-5">
        <h2 className="text-xs uppercase tracking-widest text-amber">
          Disclaimer
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {LEGAL_DISCLAIMER}
        </p>
      </div>
    </section>
  );
}
