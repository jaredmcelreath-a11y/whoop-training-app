import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src", "components", "recovery-ring.module.css"), "utf8");

describe("recovery ring animation", () => {
  it("grows the arc from empty instead of sliding the dash pattern", () => {
    expect(CSS).toMatch(/from\s*\{\s*stroke-dasharray:\s*0 390;?\s*\}/);
    expect(CSS).not.toMatch(/stroke-dashoffset/);
  });
});
