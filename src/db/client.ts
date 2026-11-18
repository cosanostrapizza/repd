import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";
import { localDatabaseDirectory, normalizeDatabaseUrl } from "./database-url";

const databaseUrl = normalizeDatabaseUrl(
  process.env.DATABASE_URL ?? "file://.repd/repd.db",
);
function createClient() {
  const directory = localDatabaseDirectory(databaseUrl);
  if (directory) mkdirSync(directory, { recursive: true });
  return new PGlite(databaseUrl);
}
function createDatabase(client: PGlite) {
  return drizzle(client, { schema });
}
type Database = ReturnType<typeof createDatabase>;
const globalDb = globalThis as unknown as {
  repdPglite?: PGlite;
  repdDatabase?: Database;
  repdMigrated?: Promise<void>;
};
function getDatabase() {
  if (!globalDb.repdPglite) globalDb.repdPglite = createClient();
  globalDb.repdDatabase ??= createDatabase(globalDb.repdPglite);
  return globalDb.repdDatabase;
}
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
export async function ensureDatabase() {
  globalDb.repdMigrated ??= migrate(getDatabase(), {
    migrationsFolder: "drizzle",
  });
  try {
    await globalDb.repdMigrated;
  } catch (error) {
    // Development hot reloads and transient filesystem failures should be
    // retryable instead of pinning a rejected migration promise globally.
    globalDb.repdMigrated = undefined;
    throw error;
  }
}
export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
