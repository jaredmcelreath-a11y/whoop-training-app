import { describe, expect, it } from "vitest";
import { INGEST_PATH, ingestUrl, maskToken, nutritionPatchFromForm } from "./form";

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

const BASE: [string, string][] = [
  ["refProfile", "female_31_50"],
  ["mealsPerDay", "4"],
  ["waterSource", "app"],
  ["gainGoalLb", "8.5"],
  ["gainStartWeightLb", "150"],
];

describe("nutritionPatchFromForm", () => {
  it("parses numbers and supplement rows, dropping empty ones", () => {
    const res = nutritionPatchFromForm(
      fd([
        ...BASE,
        ["supplementName", " Vitamin Q "],
        ["supplementTiming", "morning"],
        ["supplementName", "   "],
        ["supplementTiming", "evening"],
        ["supplementName", "Mineral Z"],
        ["supplementTiming", "with_meal"],
      ]),
    );
    expect(res).toEqual({
      ok: true,
      patch: {
        refProfile: "female_31_50",
        mealsPerDay: 4,
        waterSource: "app",
        supplements: [
          { name: "Vitamin Q", timing: "morning" },
          { name: "Mineral Z", timing: "with_meal" },
        ],
        gainGoalLb: 8.5,
        gainStartWeightLb: 150,
      },
    });
  });

  it("maps a blank profile and blank start weight to null", () => {
    const res = nutritionPatchFromForm(
      fd([["refProfile", ""], ["mealsPerDay", "3"], ["waterSource", "both"], ["gainGoalLb", "5"], ["gainStartWeightLb", ""]]),
    );
    expect(res).toMatchObject({ ok: true, patch: { refProfile: null, gainStartWeightLb: null, supplements: [] } });
  });

  it("rejects meals outside 3-6, bad numbers, bad enums and too many rows", () => {
    const bad = (over: [string, string][]) => {
      const map = new Map([...BASE, ...over]);
      return nutritionPatchFromForm(fd([...map]));
    };
    expect(bad([["mealsPerDay", "2"]]).ok).toBe(false);
    expect(bad([["mealsPerDay", "7"]]).ok).toBe(false);
    expect(bad([["mealsPerDay", "3.5"]]).ok).toBe(false);
    expect(bad([["gainGoalLb", "abc"]]).ok).toBe(false);
    expect(bad([["gainGoalLb", "0"]]).ok).toBe(false);
    expect(bad([["gainStartWeightLb", "-3"]]).ok).toBe(false);
    expect(bad([["waterSource", "nope"]]).ok).toBe(false);
    expect(bad([["refProfile", "other"]]).ok).toBe(false);
    const many: [string, string][] = [...BASE];
    for (let i = 0; i < 21; i++) many.push(["supplementName", `S${i}`], ["supplementTiming", "morning"]);
    expect(nutritionPatchFromForm(fd(many)).ok).toBe(false);
    expect(nutritionPatchFromForm(fd([...BASE, ["supplementName", "X"], ["supplementTiming", "bogus"]])).ok).toBe(false);
  });
});

describe("maskToken", () => {
  it("shows only the last four characters", () => {
    expect(maskToken("0123456789abcdefWXYZ")).toBe("••••WXYZ");
  });
  it("shows no characters for very short input", () => {
    expect(maskToken("abcd")).toBe("••••");
    expect(maskToken("")).toBe("••••");
  });
});

describe("ingestUrl", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("builds the full URL from the request host, https by default", () => {
    expect(ingestUrl(h({ host: "app.example.com" }))).toBe(`https://app.example.com${INGEST_PATH}`);
    expect(INGEST_PATH).toBe("/api/ingest/health");
  });

  it("prefers the proxy's forwarded host and protocol", () => {
    expect(ingestUrl(h({ host: "internal:8080", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" }))).toBe(
      "https://app.example.com/api/ingest/health",
    );
    expect(ingestUrl(h({ "x-forwarded-host": "a.example.com, b.example.com", "x-forwarded-proto": "https,http" }))).toBe(
      "https://a.example.com/api/ingest/health",
    );
  });

  it("uses http for a local dev host", () => {
    expect(ingestUrl(h({ host: "localhost:3000" }))).toBe("http://localhost:3000/api/ingest/health");
    expect(ingestUrl(h({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000/api/ingest/health");
    expect(ingestUrl(h({ host: "192.168.1.20:3000", "x-forwarded-proto": "http" }))).toBe("http://192.168.1.20:3000/api/ingest/health");
  });

  it("falls back to the bare path for a missing or malformed host", () => {
    expect(ingestUrl(h({}))).toBe(INGEST_PATH);
    expect(ingestUrl(h({ host: "evil.example.com/<script>" }))).toBe(INGEST_PATH);
    expect(ingestUrl(h({ host: "app.example.com", "x-forwarded-proto": "javascript" }))).toBe("https://app.example.com/api/ingest/health");
  });
});
