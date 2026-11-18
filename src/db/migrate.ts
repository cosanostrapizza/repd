import { ensureDatabase } from "./client";
async function main() {
  await ensureDatabase();
  console.log("Repd database migrations are current.");
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
