import { loadEnvConfig } from "@next/env";
import { getDb } from "@/db/client";
import { dbTarget, resolveAllowed } from "@/lib/library/db-target";
import { openProposals, resolveProposal } from "@/lib/library/user-sources";

// For a Claude Code session: lists the rule changes the owner proposed from the Library, and
// closes one with what was decided (after reading the study and weighing the rule's evidence,
// and either updating RULES with tests or explaining why not). The app never edits RULES.
//   npx tsx scripts/proposals.ts list
//   npx tsx scripts/proposals.ts resolve <id> "<what was decided>" --prod   (or --local)
// It always prints which database it is using first. Env files are loaded like the other
// scripts, so this reads production when .env.production.local holds DATABASE_URL (where the
// owner's proposals live). A fresh checkout without that file falls back to the local PGlite
// database: check the Database line. For local runs use `DATABASE_URL= npx tsx …` with
// `npm run dev` stopped (PGlite allows only one process). Resolving needs --prod on Neon and
// --local on the local database, so a write always names its target.
async function main() {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const [cmd, id, ...rest] = args.filter((a) => !a.startsWith("--"));
  const target = dbTarget(process.env.DATABASE_URL);
  console.log(`Database: ${target.label}`);
  const db = getDb();
  if (cmd === "list") {
    const open = await openProposals(db);
    if (!open.length) console.log("No open proposals.");
    for (const p of open) {
      console.log(
        [
          `${p.id}  ${p.createdAt.toISOString().slice(0, 10)}  rule ${p.ruleId}  (${p.stance}, ${p.evidence})`,
          `  ${p.title}${p.venue ? ` — ${p.venue}` : ""}${p.year ? ` ${p.year}` : ""}`,
          `  ${p.url}`,
          p.note ? `  Owner's note: ${p.note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    process.exit(0);
  }
  if (cmd === "resolve" && id && rest.length) {
    if (!resolveAllowed(target, flags)) {
      console.error(`Refusing to write: add ${target.kind === "neon" ? "--prod" : "--local"} to confirm the database above.`);
      process.exit(1);
    }
    const r = await resolveProposal(db, id, rest.join(" "));
    console.log(r === "resolved" ? "resolved" : r === "already" ? "already resolved" : "no such proposal");
    process.exit(r === "missing" ? 1 : 0);
  }
  console.error('Usage: proposals.ts list | resolve <id> "<what was decided>" --prod|--local');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
