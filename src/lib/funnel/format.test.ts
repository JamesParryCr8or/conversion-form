import { describe, expect, it } from "vitest";
import { formatAnswer } from "./format";
import type { Question } from "./schema";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("formatAnswer", () => {
  it("shows option labels for choices", () => {
    const q = { key: "k", type: "single_choice", label: "L", required: true, sameScreen: false, layout: "buttons", autoAdvance: true, options } as Question;
    expect(formatAnswer(q, "b")).toBe("Beta");
    const m = { key: "k", type: "multiple_choice", label: "L", required: true, sameScreen: false, options } as Question;
    expect(formatAnswer(m, ["a", "b"])).toBe("Alpha, Beta");
  });

  it("formats addresses, consent and ratings", () => {
    const addr = { key: "a", type: "address", label: "L", required: true, sameScreen: false, countries: "uk" } as Question;
    expect(formatAnswer(addr, { line1: "1 High St", town: "Leeds", postcode: "LS1 1AA" })).toBe("1 High St, Leeds, LS1 1AA");
    const consent = { key: "c", type: "consent", label: "L", required: true, sameScreen: false } as Question;
    expect(formatAnswer(consent, true)).toBe("Agreed");
    const rating = { key: "r", type: "rating", label: "L", required: true, sameScreen: false, scale: 5 } as Question;
    expect(formatAnswer(rating, 4)).toBe("4 / 5");
  });

  it("returns nothing for empty or non-input questions", () => {
    const text = { key: "t", type: "short_text", label: "L", required: true, sameScreen: false } as Question;
    expect(formatAnswer(text, undefined)).toBe("");
    expect(formatAnswer(text, "")).toBe("");
    const stmt = { key: "s", type: "statement", label: "L", required: false, sameScreen: false, buttonText: "Go" } as Question;
    expect(formatAnswer(stmt, "x")).toBe("");
  });
});
