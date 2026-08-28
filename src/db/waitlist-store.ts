import { db } from "./client";
import { waitlist } from "./schema";

/**
 * The waitlist is the only user-entered value Preflight stores, and it is an
 * email the visitor typed on purpose. Sizing numbers never reach this module
 * (CLAUDE.md §2.3).
 */

/** Deliberately permissive: one @, a dot in the domain, no whitespace. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistResult =
  | { ok: true; alreadyJoined: boolean }
  | { ok: false; error: string };

export function joinWaitlist(rawEmail: string): WaitlistResult {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return { ok: false, error: "That does not look like an email address." };
  }
  const inserted = db()
    .insert(waitlist)
    .values({ email })
    .onConflictDoNothing({ target: waitlist.email })
    .returning({ id: waitlist.id })
    .all();
  return { ok: true, alreadyJoined: inserted.length === 0 };
}
