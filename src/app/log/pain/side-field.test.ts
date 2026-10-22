import { describe, expect, it } from "vitest";
import { sideField } from "./side-field";

describe("sideField", () => {
  it("hides the picker and uses the saved side when one is set", () => {
    expect(sideField("left")).toEqual({ hidden: true, value: "left" });
  });
  it("shows the picker when no side is set", () => {
    expect(sideField(null)).toEqual({ hidden: false });
  });
});
