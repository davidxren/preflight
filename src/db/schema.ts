import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The core app persists two tables (CLAUDE.md §10): `cache` and `waitlist`.
 * `predictions` is added by the calibration practice mode and holds an
 * anonymous cookie id, never an account or an email. Nothing here holds
 * user-entered sizing numbers or any other personal data beyond a waitlist
 * email the visitor typed on purpose.
 */

/** Cached live responses, keyed by source and symbol. */
export const cache = sqliteTable(
  "cache",
  {
    key: text("key").primaryKey(),
    payload: text("payload").notNull(),
    fetchedAt: integer("fetched_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("cache_fetched_at_idx").on(table.fetchedAt)],
);

export const waitlist = sqliteTable("waitlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Calibration practice forecasts (CLAUDE.md §10, amended to three tables).
 * Every column maps to one permitted field and nothing else:
 *
 *   id            -> id
 *   visitorId     -> anonymous cookie id
 *   symbol        -> ticker
 *   direction     -> predicted direction
 *   confidence    -> confidence
 *   createdAt     -> created_at
 *   resolveAfter  -> resolve-after date
 *   outcome       -> resolved outcome
 *   baseClose     -> Brier component (the reference the outcome is read against)
 *
 * No email, no sizing input, and nothing that identifies a person.
 */
export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    visitorId: text("visitor_id").notNull(),
    symbol: text("symbol").notNull(),
    direction: text("direction", { enum: ["up", "down"] }).notNull(),
    /** Confidence in the stated direction, 0.5 to 1. */
    confidence: real("confidence").notNull(),
    /** First trading date on which this forecast can settle, `YYYY-MM-DD`. */
    resolveAfter: text("resolve_after").notNull(),
    /** The close the outcome is measured against. */
    baseClose: real("base_close").notNull(),
    /** Null until later price data reaches the resolve-after date. */
    outcome: text("outcome", { enum: ["up", "down"] }),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("predictions_visitor_idx").on(table.visitorId)],
);

export type CacheRow = typeof cache.$inferSelect;
export type WaitlistRow = typeof waitlist.$inferSelect;
export type PredictionRow = typeof predictions.$inferSelect;
