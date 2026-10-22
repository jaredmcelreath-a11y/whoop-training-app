import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_LABEL } from "@/lib/log/exercise-catalog";
import { REF_PROFILES, TIMINGS } from "@/lib/nutrition/form";
import { titleCase } from "./title-case";

const SRC = join(process.cwd(), "src");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

describe("select options are capitalized", () => {
  it("literal <option> text is in Title Case", () => {
    const bad: string[] = [];
    for (const f of walk(SRC).filter((x) => x.endsWith(".tsx") && !x.includes(".test."))) {
      for (const m of readFileSync(f, "utf8").matchAll(/<option[^>]*>\s*([^<{\s][^<{]*)</g)) {
        const text = m[1].trim();
        if (titleCase(text) !== text) bad.push(`${f.slice(SRC.length + 1)}: ${text}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // Options rendered from an expression ({p.label}) are invisible to the scan above.
  it("option label lists are in Title Case", () => {
    const labels = [...Object.values(CATEGORY_LABEL), ...REF_PROFILES.map((p) => p.label), ...TIMINGS.map((t) => t.label)];
    expect(labels.filter((l) => titleCase(l) !== l)).toEqual([]);
  });
});
