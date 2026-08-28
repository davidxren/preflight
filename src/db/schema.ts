import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Two tables only (CLAUDE.md §10). Nothing here holds user-entered sizing
 * numbers or any other personal data beyond a waitlist email the visitor
 * typed on purpose.
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

export type CacheRow = typeof cache.$inferSelect;
export type WaitlistRow = typeof waitlist.$inferSelect;
