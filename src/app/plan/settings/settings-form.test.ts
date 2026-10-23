import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// iOS's numeric keypad has no ":", so a field that needs m:ss or h:mm must not ask for it.
describe("settings form clock fields", () => {
  it("can be typed on a phone", () => {
    const src = readFileSync(join(process.cwd(), "src/app/plan/settings/settings-form.tsx"), "utf8");
    for (const name of ["startSwim", "startRun", "goal"]) {
      const tag = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(src)?.[0] ?? "";
      expect(tag, name).not.toBe("");
      expect(tag, name).not.toMatch(/inputMode="(numeric|decimal)"/);
    }
  });
});
