import { existsSync, readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { getDb } from "@/db/client";
import { BaselineFile, baselineError, seedBaseline } from "@/lib/log/baseline";

// Loads docs/baseline.local.json (gitignored, private) into the database. Prints counts only.
// With the local PGlite database, stop `npm run dev` first: PGlite allows only one process.
const FILE = "docs/baseline.local.json";

async function main() {
  loadEnvConfig(process.cwd());
  if (!existsSync(FILE)) {
    console.error(`${FILE} not found — see docs/baseline.local.md`);
    process.exit(1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    console.error(`${FILE} is not valid JSON.`);
    process.exit(1);
  }
  const parsed = BaselineFile.safeParse(raw);
  if (!parsed.success) {
    console.error(baselineError(parsed.error));
    process.exit(1);
  }
  const counts = await seedBaseline(getDb(), parsed.data);
  console.log("Seeded baseline:", counts);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
