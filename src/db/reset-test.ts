import { rmSync } from "node:fs";

const target = ".repd/e2e.db";
if (!target.includes("e2e"))
  throw new Error("Refusing to reset a non-test database.");
rmSync(target, { recursive: true, force: true });
console.log("Reset isolated Playwright database.");
