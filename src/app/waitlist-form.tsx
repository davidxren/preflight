"use client";

import { useActionState } from "react";
import { submitWaitlist, type WaitlistResponse } from "./actions";
import { INPUT_CLASS } from "./field";

/** The one field whose value is stored (CLAUDE.md §10). */
export function WaitlistForm(): React.ReactElement {
  const [state, formAction, pending] = useActionState<WaitlistResponse | null, FormData>(
    submitWaitlist,
    null,
  );

  return (
    <form action={formAction} className="mt-4">
      <label className="block text-xs uppercase tracking-widest text-ink-muted" htmlFor="email">
        Email
      </label>
      <div className="mt-1 flex flex-wrap gap-3">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={`${INPUT_CLASS} mt-0 max-w-xs flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="border border-ink px-5 py-2 text-sm text-ink disabled:opacity-50"
        >
          {pending ? "Joining…" : "Join the list"}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-ink-muted">
        {state ? (state.ok ? state.message : state.error) : ""}
      </p>
    </form>
  );
}
