import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTES, THEMES, TOKENS, contrastRatio, resolveTheme, themeColor, type Theme } from "./theme";

const SRC = join(process.cwd(), "src");
const GLOBALS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** The declarations inside the CSS rule whose selector list contains `selector`. */
function blockFor(selector: string): string {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of GLOBALS.matchAll(re)) {
    if (m[1].split(",").map((s) => s.trim()).includes(selector)) return m[2];
  }
  return "";
}

describe("resolveTheme", () => {
  it("defaults to dark for missing or unknown values", () => {
    expect(resolveTheme(null)).toBe("dark");
    expect(resolveTheme(undefined)).toBe("dark");
    expect(resolveTheme("neon")).toBe("dark");
  });
  it("accepts a known theme", () => {
    expect(resolveTheme("espresso")).toBe("espresso");
  });
});

describe("themeColor", () => {
  it("is each palette's background", () => {
    expect(themeColor("dark")).toBe("#0b0e12");
    expect(themeColor("espresso")).toBe("#1e1712");
  });
});

describe("globals.css matches the palettes", () => {
  const selectors: Record<Theme, string> = { dark: '[data-theme="dark"]', espresso: '[data-theme="espresso"]' };
  for (const theme of THEMES) {
    it(`declares every ${theme} token with the palette value`, () => {
      const block = blockFor(selectors[theme]);
      for (const token of TOKENS) {
        const m = block.match(new RegExp(`--${token}:\\s*([^;]+);`));
        expect(m?.[1].trim(), `${theme} --${token}`).toBe(PALETTES[theme][token]);
      }
    });
  }
  it("applies dark at :root so the page is dark before any script runs", () => {
    expect(blockFor(":root")).toBe(blockFor('[data-theme="dark"]'));
  });
});

describe("contrast (WCAG AA)", () => {
  const TEXT_TOKENS = ["text", "sub", "accent", "good", "caution", "low", "info", "sleep"] as const;
  for (const theme of THEMES) {
    const p = PALETTES[theme];
    for (const t of TEXT_TOKENS) {
      it(`${theme}: ${t} reaches 4.5:1 on bg and on card`, () => {
        expect(contrastRatio(p[t], p.bg, p.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p[t], p.card, p.bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${theme}: on-accent text reaches 4.5:1 on filled good and accent buttons`, () => {
      expect(contrastRatio(p["on-accent"], p.good, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p["on-accent"], p.accent, p.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("computes known ratios", () => {
    expect(contrastRatio("#ffffff", "#000000", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#000000", "#000000", "#000000")).toBeCloseTo(1, 5);
  });
});

describe("colors live only in the theme files", () => {
  const EXEMPT = new Set(["globals.css", "theme.ts", "manifest.ts", "layout.tsx"]);
  const files = walk(SRC).filter((f) => /\.(css|tsx?)$/.test(f) && !/\.test\./.test(f) && !EXEMPT.has(f.split("/").pop()!));

  it("no other file has a color literal", () => {
    const offenders = files.filter((f) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it("every var(--x) used names a defined token", () => {
    const defined = new Set(TOKENS.map((t) => `--${t}`));
    const missing = new Set<string>();
    for (const f of [...files, join(SRC, "app", "globals.css")]) {
      for (const m of readFileSync(f, "utf8").matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(m[1])) missing.add(`${f.slice(SRC.length + 1)}: ${m[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});

describe("hot card", () => {
  const CSS = readFileSync(join(SRC, "components", "ui", "ui.module.css"), "utf8");

  it("sits on an opaque base so the page glow can't bleed through", () => {
    const rule = CSS.match(/\.card\[data-hot="true"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/background:[^;]*var\(--bg\)\s*;/);
  });

  for (const theme of THEMES) {
    it(`${theme}: secondary and status text stay readable on the hot gradient`, () => {
      const p = PALETTES[theme];
      const tint = (hex: string, a: number) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
      };
      for (const t of ["text", "sub", "accent"] as const) {
        expect(contrastRatio(p[t], tint(p.accent, 0.2), p.bg), t).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
