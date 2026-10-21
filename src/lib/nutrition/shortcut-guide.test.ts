import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_MD } from "./shortcut-guide";
import { parseGuide } from "./guide-render";

describe("shortcut guide", () => {
  it("bundled constant equals docs/apple-health-shortcut.md", () => {
    const doc = readFileSync(path.join(process.cwd(), "docs", "apple-health-shortcut.md"), "utf8");
    expect(GUIDE_MD).toBe(doc);
  });
});

describe("parseGuide", () => {
  it("parses headings, lists, code blocks, tables and paragraphs", () => {
    const md = "# T\n\npara one\ncontinues\n\n- a\n- b\n\n1. x\n2. y\n\n```sh\ncurl x\n```\n\n| H1 | H2 |\n| --- | --- |\n| c1 | c2 |\n";
    expect(parseGuide(md)).toEqual([
      { type: "heading", level: 1, text: "T" },
      { type: "para", text: "para one continues" },
      { type: "ul", items: ["a", "b"] },
      { type: "ol", start: 1, items: ["x", "y"] },
      { type: "code", text: "curl x" },
      { type: "table", head: ["H1", "H2"], rows: [["c1", "c2"]] },
    ]);
  });
  it("handles the real guide without dropping content", () => {
    const blocks = parseGuide(GUIDE_MD);
    expect(blocks.some((b) => b.type === "table")).toBe(true);
    expect(blocks.some((b) => b.type === "code")).toBe(true);
    expect(blocks.filter((b) => b.type === "heading").length).toBeGreaterThan(5);
  });
});
