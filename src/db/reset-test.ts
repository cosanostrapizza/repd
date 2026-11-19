import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { normalizeDatabaseUrl } from "./database-url";

const databaseUrl = normalizeDatabaseUrl(
  process.env.DATABASE_URL ?? "file://.repd/e2e.db",
);
if (!databaseUrl.startsWith("file://"))
  throw new Error("Test reset requires a local file database.");
const target = databaseUrl.slice("file://".length);
const resolvedTarget = resolve(target);
const isolatedRoot = `${resolve(".repd")}${sep}`;
if (!resolvedTarget.startsWith(isolatedRoot) || !target.includes("e2e"))
  throw new Error("Refusing to reset a non-test database.");
rmSync(resolvedTarget, { recursive: true, force: true });
console.log(`Reset isolated Playwright database at ${target}.`);
