import { describe, expect, it } from "vitest";
import { dbTarget, resolveAllowed } from "./db-target";

describe("dbTarget (review I3)", () => {
  it("names the database without its credentials", () => {
    expect(dbTarget("postgresql://user:secret@ep-invented-123.us-east-2.aws.neon.tech/neondb?sslmode=require")).toEqual({
      kind: "neon",
      label: "Neon (ep-invented-123.us-east-2.aws.neon.tech)",
    });
    expect(dbTarget(undefined)).toEqual({ kind: "local", label: "local PGlite (./.data/pglite)" });
    expect(dbTarget("")).toEqual({ kind: "local", label: "local PGlite (./.data/pglite)" });
  });
  it("makes resolving name its target", () => {
    expect(resolveAllowed({ kind: "neon", label: "" }, [])).toBe(false);
    expect(resolveAllowed({ kind: "neon", label: "" }, ["--prod"])).toBe(true);
    expect(resolveAllowed({ kind: "local", label: "" }, ["--prod"])).toBe(false);
    expect(resolveAllowed({ kind: "local", label: "" }, ["--local"])).toBe(true);
  });
});
