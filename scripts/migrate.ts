import path from "node:path";

async function main() {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(drizzle(neon(url)), { migrationsFolder });
  } else {
    const { mkdirSync } = await import("node:fs");
    mkdirSync("./.data", { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(drizzle(new PGlite("./.data/pglite")), { migrationsFolder });
  }
  console.log("migrations applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
