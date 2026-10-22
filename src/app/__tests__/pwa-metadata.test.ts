import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { metadata, viewport } from "../layout";

describe("iPhone Home Screen metadata", () => {
  it("declares a standalone web app with a translucent status bar", () => {
    expect(metadata.appleWebApp).toMatchObject({
      capable: true,
      title: "Seventy3",
      statusBarStyle: "black-translucent",
    });
  });

  it("points the apple touch icon at a file that exists", () => {
    const apple = (metadata.icons as { apple: string }).apple;
    expect(apple).toBe("/icons/apple-touch-icon.png");
    expect(existsSync(join(process.cwd(), "public", apple))).toBe(true);
  });

  it("covers the notch and sets the theme colour", () => {
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toBe("#0b0e12");
  });
});
