import { Field, INPUT_CLASS } from "./field";

/**
 * Check-4 inputs. These numbers stay in memory for the length of the request
 * and are never persisted (CLAUDE.md §2.3).
 *
 * "Win rate" is the one place the phrase is permitted (CLAUDE.md §7/§11): it
 * is the label on this input and nowhere else.
 */
export function SizingFields(): React.ReactElement {
  return (
    <fieldset className="mt-6 border-t border-rule pt-5">
      <legend className="sr-only">Position sizing</legend>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs uppercase tracking-widest text-amber">
          Position sizing (optional)
        </h2>
        <p className="text-xs text-ink-faint">Not stored, not sent anywhere</p>
      </div>
      <p className="mt-2 max-w-prose text-xs text-ink-muted">
        Fill all five to run check 4. Leave them blank and check 4 reports that
        no numbers were entered.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Account equity" hint="Dollars">
          <input
            className={INPUT_CLASS}
            type="number"
            name="equity"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="10000"
          />
        </Field>
        <Field label="Risk per trade" hint="Percent of equity">
          <input
            className={INPUT_CLASS}
            type="number"
            name="riskPerTrade"
            min="0"
            max="100"
            step="any"
            inputMode="decimal"
            placeholder="2"
          />
        </Field>
        <Field label="Win rate" hint="Percent of trades that win">
          <input
            className={INPUT_CLASS}
            type="number"
            name="winRate"
            min="0"
            max="100"
            step="any"
            inputMode="decimal"
            placeholder="50"
          />
        </Field>
        <Field label="Payoff ratio" hint="Average win ÷ average loss">
          <input
            className={INPUT_CLASS}
            type="number"
            name="payoffRatio"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="2"
          />
        </Field>
        <Field label="Risk budget" hint="Percent of equity that counts as ruin">
          <input
            className={INPUT_CLASS}
            type="number"
            name="riskBudget"
            min="0"
            max="100"
            step="any"
            inputMode="decimal"
            placeholder="50"
          />
        </Field>
      </div>
    </fieldset>
  );
}
