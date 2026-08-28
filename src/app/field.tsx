/**
 * Shared form field chrome. Labels are nouns and sit above the control, as on
 * a printed checklist.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export const INPUT_CLASS =
  "figure mt-1 w-full border border-rule-strong bg-paper px-3 py-2 text-sm " +
  "text-ink outline-none focus:border-amber";
