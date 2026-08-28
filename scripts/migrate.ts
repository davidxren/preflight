/**
 * Applies the drizzle-kit migrations in ./drizzle to the SQLite file.
 *
 *   npm run db:migrate
 */
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, dbPath } from "@/db/client";

migrate(db(), { migrationsFolder: "./drizzle" });

const tables = db()
  .$client.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
  )
  .all() as { name: string }[];

console.log(`Migrated ${dbPath()}`);
console.log(`Tables: ${tables.map((t) => t.name).join(", ")}`);
