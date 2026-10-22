import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_SCRIPT } from "./theme";
import { applyStoredTheme } from "./theme-dom";

type FakeDoc = { documentElement: { dataset: Record<string, string> }; querySelector: () => { setAttribute: (k: string, v: string) => void } | null };

function stub(storage: () => string | null) {
  const meta: Record<string, string> = {};
  const doc: FakeDoc = {
    documentElement: { dataset: { theme: "dark" } },
    querySelector: () => ({ setAttribute: (k, v) => (meta[k] = v) }),
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("localStorage", { getItem: storage });
  return { doc, meta };
}

afterEach(() => vi.unstubAllGlobals());

describe("applyStoredTheme (re-applies after the dev remount)", () => {
  it("applies the stored theme and its browser bar color", () => {
    const { doc, meta } = stub(() => "espresso");
    applyStoredTheme();
    expect(doc.documentElement.dataset.theme).toBe("espresso");
    expect(meta.content).toBe("#1e1712");
  });

  it("leaves Dark in place when storage is blocked", () => {
    const { doc } = stub(() => {
      throw new Error("SecurityError");
    });
    expect(() => applyStoredTheme()).not.toThrow();
    expect(doc.documentElement.dataset.theme).toBe("dark");
  });
});

describe("THEME_SCRIPT", () => {
  it("does nothing and never throws when storage is blocked", () => {
    const { doc } = stub(() => {
      throw new Error("SecurityError");
    });
    expect(() => new Function(THEME_SCRIPT)()).not.toThrow();
    expect(doc.documentElement.dataset.theme).toBe("dark");
  });

  it("applies a stored theme", () => {
    const { doc } = stub(() => "espresso");
    new Function(THEME_SCRIPT)();
    expect(doc.documentElement.dataset.theme).toBe("espresso");
  });
});
