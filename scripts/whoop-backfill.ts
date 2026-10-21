import { loadEnvConfig } from "@next/env";
import { getDb } from "@/db/client";
import { syncRange } from "@/lib/whoop/sync";

// One-off history pull. With the local PGlite database, stop `npm run dev` first:
// PGlite allows only one process at a time.
async function main() {
  loadEnvConfig(process.cwd());
  const from = new Date(process.argv[2] ?? "2026-08-01T00:00:00Z");
  if (Number.isNaN(from.getTime())) throw new Error(`Bad start date: ${process.argv[2]}`);
  const counts = await syncRange(getDb(), from);
  console.log(`Backfilled from ${from.toISOString()}:`, counts);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
