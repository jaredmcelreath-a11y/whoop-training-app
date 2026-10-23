import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("form controls stay inside their cards", () => {
  it("caps every control at its container's width", () => {
    expect(CSS).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/);
  });

  it("drops iOS Safari's fixed width on date, time and date-time inputs", () => {
    const rule = CSS.match(/input\[type="date"\],\s*input\[type="time"\],\s*input\[type="datetime-local"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/appearance:\s*none/);
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/display:\s*block/);
  });
});
