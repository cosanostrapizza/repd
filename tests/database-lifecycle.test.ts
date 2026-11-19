import { afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "repd-lifecycle-"));
const databaseUrl = `file://${join(directory, "database")}`;
process.env.DATABASE_URL = databaseUrl;

describe("persistent PGlite lifecycle", () => {
  afterAll(async () => rm(directory, { recursive: true, force: true }));

  it("closes cleanly and can be reopened after migration", async () => {
    const { closeDatabase, db, ensureDatabase } =
      await import("../src/db/client");
    await ensureDatabase();
    await db.execute("SELECT 1");
    await closeDatabase();

    const reopened = new PGlite(databaseUrl);
    try {
      const result = await reopened.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"',
      );
      expect(result.rows[0]?.count).toBe(6);
    } finally {
      await reopened.close();
    }
  }, 30_000);
});
