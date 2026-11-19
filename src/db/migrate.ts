import { closeDatabase, ensureDatabase } from "./client";
async function main() {
  await ensureDatabase();
  console.log("Repd database migrations are current.");
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

void run();
