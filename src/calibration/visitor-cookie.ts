import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

/**
 * An anonymous, opaque id so a visitor's own forecasts can be scored together.
 * It is not an account and carries nothing about the person: no email, no
 * name, nothing derived from the request (CLAUDE.md §2.3).
 */

export const VISITOR_COOKIE = "preflight_calibration_id";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Reads the id, minting and setting one when the visitor has none. */
export async function visitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;

  const minted = randomUUID();
  jar.set(VISITOR_COOKIE, minted, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return minted;
}
