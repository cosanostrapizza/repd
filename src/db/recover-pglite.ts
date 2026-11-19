import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonRow = Record<string, unknown>;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function localPath(url: string) {
  if (!url.startsWith("file://"))
    throw new Error(`${url} is not a local PGlite file URL.`);
  return resolve(
    url.startsWith("file:///") ? fileURLToPath(url) : url.slice(7),
  );
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function canonicalRows(rows: JsonRow[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
}

async function readRows(database: PGlite, table: string) {
  const identifier = quoteIdentifier(table);
  const result = await database.query<{ rows: JsonRow[] }>(
    `SELECT COALESCE(json_agg(row_to_json(source)), '[]'::json) AS rows FROM (SELECT * FROM public.${identifier}) source`,
  );
  return result.rows[0]?.rows ?? [];
}

async function foreignKeyViolations(database: PGlite) {
  const constraints = await database.query<{
    constraint_name: string;
    child_table: string;
    parent_table: string;
    child_columns: string[];
    parent_columns: string[];
  }>(`
    SELECT
      reference.constraint_name,
      child.table_name AS child_table,
      parent.table_name AS parent_table,
      array_agg(child.column_name ORDER BY child.ordinal_position) AS child_columns,
      array_agg(parent.column_name ORDER BY child.ordinal_position) AS parent_columns
    FROM information_schema.referential_constraints reference
    JOIN information_schema.key_column_usage child
      ON child.constraint_schema = reference.constraint_schema
      AND child.constraint_name = reference.constraint_name
    JOIN information_schema.key_column_usage parent
      ON parent.constraint_schema = reference.unique_constraint_schema
      AND parent.constraint_name = reference.unique_constraint_name
      AND parent.ordinal_position = child.position_in_unique_constraint
    WHERE reference.constraint_schema = 'public'
    GROUP BY reference.constraint_name, child.table_name, parent.table_name
    ORDER BY reference.constraint_name
  `);
  const violations: Array<{ constraint: string; count: number }> = [];
  for (const constraint of constraints.rows) {
    const child = quoteIdentifier(constraint.child_table);
    const parent = quoteIdentifier(constraint.parent_table);
    const join = constraint.child_columns
      .map(
        (column, index) =>
          `child.${quoteIdentifier(column)} = parent.${quoteIdentifier(constraint.parent_columns[index])}`,
      )
      .join(" AND ");
    const present = constraint.child_columns
      .map((column) => `child.${quoteIdentifier(column)} IS NOT NULL`)
      .join(" AND ");
    const missing = constraint.parent_columns
      .map((column) => `parent.${quoteIdentifier(column)} IS NULL`)
      .join(" AND ");
    const result = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.${child} child LEFT JOIN public.${parent} parent ON ${join} WHERE ${present} AND ${missing}`,
    );
    const count = result.rows[0]?.count ?? 0;
    if (count)
      violations.push({ constraint: constraint.constraint_name, count });
  }
  return violations;
}

async function main() {
  const sourceUrl = argument("--source");
  const targetUrl = argument("--target");
  if (!sourceUrl || !targetUrl)
    throw new Error(
      "Usage: pnpm db:recover -- --source file:///copy.db --target file:///new.db",
    );
  const sourcePath = localPath(sourceUrl);
  const targetPath = localPath(targetUrl);
  if (sourcePath === targetPath)
    throw new Error("Source and target must be independent PGlite stores.");
  if (!existsSync(sourcePath))
    throw new Error(`Source does not exist: ${sourcePath}`);
  if (existsSync(targetPath))
    throw new Error(
      `Target already exists; refusing to overwrite it: ${targetPath}`,
    );
  await mkdir(dirname(targetPath), { recursive: true });

  const source = new PGlite(sourceUrl);
  const target = new PGlite(targetUrl);
  const report: Record<string, unknown> = {
    source: sourcePath,
    target: targetPath,
  };
  try {
    await source.waitReady;
    await migrate(drizzle(target), { migrationsFolder: "drizzle" });
    const sourceTables = await source.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const targetTables = new Set(
      (
        await target.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((row) => row.tablename),
    );
    const missingTables = sourceTables.rows
      .map((row) => row.tablename)
      .filter((table) => !targetTables.has(table));
    if (missingTables.length)
      throw new Error(
        `Target schema is missing tables: ${missingTables.join(", ")}`,
      );

    const exported = new Map<string, JsonRow[]>();
    for (const { tablename } of sourceTables.rows)
      exported.set(tablename, await readRows(source, tablename));

    await target.exec("SET session_replication_role = replica");
    try {
      for (const [table, rows] of exported) {
        if (!rows.length) continue;
        const identifier = quoteIdentifier(table);
        await target.query(
          `INSERT INTO public.${identifier} SELECT * FROM json_populate_recordset(NULL::public.${identifier}, $1::json)`,
          [JSON.stringify(rows)],
        );
      }
    } finally {
      await target.exec("SET session_replication_role = origin");
    }

    const counts: Record<string, number> = {};
    const discrepancies: string[] = [];
    for (const [table, rows] of exported) {
      counts[table] = rows.length;
      const imported = await readRows(target, table);
      if (
        JSON.stringify(canonicalRows(imported)) !==
        JSON.stringify(canonicalRows(rows))
      )
        discrepancies.push(table);
    }
    const violations = await foreignKeyViolations(target);
    if (discrepancies.length || violations.length)
      throw new Error(
        `Recovery verification failed: row discrepancies [${discrepancies.join(", ")}], foreign-key violations ${JSON.stringify(violations)}`,
      );
    const migrationCount = await target.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"',
    );
    report.tables = counts;
    report.foreignKeyViolations = violations;
    report.appliedMigrations = migrationCount.rows[0]?.count ?? 0;
    report.verified = true;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.allSettled([source.close(), target.close()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
