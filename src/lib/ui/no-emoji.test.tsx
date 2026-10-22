import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ICON_FOR_KIND, Icon } from "@/components/icon";
import type { SessionKind } from "@/db/schema";

const SRC = join(process.cwd(), "src");
const THIS_FILE = join(SRC, "lib", "ui", "no-emoji.test.tsx");
/** Files that must contain emoji, each with the reason. Empty: none need to. */
const ALLOWLIST: string[] = [];

// Emoji, plus the Miscellaneous Symbols and Dingbats blocks (✓ ✕ ★ ⚠ …), which must be icons instead.
const PICTOGRAPH = /[\p{Extended_Pictographic}\u2600-\u27BF]/u;
const ALLOWED_SYMBOLS = ["·", "–", "—", "×", "±", "°", "↑", "↓", "→", "←"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("no emoji in the app", () => {
  it("no file under src/ contains a pictographic character", () => {
    const hits: string[] = [];
    for (const f of walk(SRC)) {
      if (f === THIS_FILE || ALLOWLIST.includes(f.slice(SRC.length + 1))) continue;
      const text = readFileSync(f, "utf8");
      for (const ch of new Set(Array.from(text).filter((c) => PICTOGRAPH.test(c)))) {
        hits.push(`${f.slice(SRC.length + 1)}: ${ch}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps the plain text symbols the app uses", () => {
    expect(ALLOWED_SYMBOLS.filter((c) => PICTOGRAPH.test(c))).toEqual([]);
  });
});

describe("Icon", () => {
  it("renders a decorative svg by default", () => {
    const html = renderToStaticMarkup(<Icon name="moon" />);
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders a labelled image when given a label", () => {
    const html = renderToStaticMarkup(<Icon name="check" label="Done" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Done"');
    expect(html).not.toContain("aria-hidden");
  });

  it("has an icon for every session kind", () => {
    const kinds: SessionKind[] = ["swim", "bike", "run", "strength", "lower_leg", "core", "mobility", "rest"];
    for (const k of kinds) expect(ICON_FOR_KIND[k], k).toBeTruthy();
  });
});
