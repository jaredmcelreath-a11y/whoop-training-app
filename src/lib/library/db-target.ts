/**
 * Which database a script is about to use, named without credentials, and the guard that makes
 * a write say so: resolving a proposal needs --prod on Neon and --local on the local database.
 */
export type DbTarget = { kind: "neon" | "local"; label: string };

export function dbTarget(url: string | undefined): DbTarget {
  if (!url) return { kind: "local", label: "local PGlite (./.data/pglite)" };
  try {
    return { kind: "neon", label: `Neon (${new URL(url).host})` };
  } catch {
    return { kind: "neon", label: "Neon (unparsed DATABASE_URL)" };
  }
}

export function resolveAllowed(target: DbTarget, flags: readonly string[]): boolean {
  return flags.includes(target.kind === "neon" ? "--prod" : "--local");
}
