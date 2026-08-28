import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/** drizzle exposes the raw driver as `$client`; migrations need it for DDL. */
export type PreflightDatabase = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

/**
 * The database is opened lazily and only by the paths that need it: sample
 * mode runs the whole report without ever touching SQLite.
 */

/** Read on each open so a changed path takes effect without a restart. */
export function dbPath(
  env: Pick<NodeJS.ProcessEnv, "PREFLIGHT_DB_PATH"> = process.env,
): string {
  return env.PREFLIGHT_DB_PATH?.trim() || "./preflight.db";
}

let connection: PreflightDatabase | null = null;
let connectedPath: string | null = null;

export function db(): PreflightDatabase {
  const path = dbPath();
  if (!connection || connectedPath !== path) {
    const sqlite = new Database(path);
    // WAL keeps a report read from blocking a waitlist write.
    sqlite.pragma("journal_mode = WAL");
    connection = drizzle(sqlite, { schema });
    connectedPath = path;
  }
  return connection;
}

export { schema };
