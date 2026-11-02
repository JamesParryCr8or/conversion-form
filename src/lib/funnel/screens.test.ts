import { describe, expect, it } from "vitest";
import { computePath, firstStep, nextStep, screenHead, screenOf, screens } from "./engine";
import { parseFunnel } from "./io";
import sample from "./templates/lead-gen.json";

const base = (() => {
  const r = parseFunnel(sample);
  if (!r.ok) throw new Error(r.errors.join());
  return r.funnel;
})();

/** Stack the email and phone questions onto the same screen as the name. */
const stacked = (() => {
  const f = structuredClone(base);
  f.questions = f.questions.map((q) => (["phone", "email"].includes(q.key) ? { ...q, sameScreen: true } : q)) as typeof f.questions;
  return f;
})();

describe("screens", () => {
  it("unstacked funnel: one question per screen (unchanged behaviour)", () => {
    expect(screens(base).every((s) => s.length === 1)).toBe(true);
    expect(firstStep(base)).toEqual({ kind: "question", key: "service" });
  });

  it("groups questions marked sameScreen with the question above", () => {
    const s = screens(stacked);
    expect(s.find((x) => x.includes("full_name"))).toEqual(["full_name", "email", "phone"]);
    expect(screenHead(stacked, "phone")).toBe("full_name");
    expect(screenOf(stacked, "email")).toEqual(["full_name", "email", "phone"]);
  });

  it("the first question can't be stacked onto nothing", () => {
    const f = structuredClone(base);
    f.questions[0] = { ...f.questions[0], sameScreen: true };
    expect(screens(f)[0][0]).toBe(f.questions[0].key);
  });

  it("next step leaves the whole screen at once", () => {
    expect(nextStep(stacked, "email", {}, {})).toEqual({ kind: "question", key: "consent" });
  });

  it("validation covers every question on the screen", () => {
    const answers = { service: "website", budget: "1k_5k", full_name: "Sam", email: "sam@example.com" }; // phone missing
    expect(computePath(stacked, answers, {}).missing).toBe("phone");
  });

  it("completes when the whole stacked screen is valid", () => {
    const answers = { service: "website", budget: "1k_5k", full_name: "Sam", email: "sam@example.com", phone: "+447712345678", consent: true };
    expect(computePath(stacked, answers, {}).endKey).toBe("thanks");
  });

  it("logic on the last question of a screen still applies", () => {
    const f = structuredClone(stacked);
    f.logic = [{ id: "x", after: "phone", combinator: "and", conditions: [{ source: { kind: "question", key: "phone" }, operator: "is_answered" }], action: { type: "end", screen: "not_a_fit" } }];
    expect(nextStep(f, "full_name", { phone: "+447712345678" }, {})).toEqual({ kind: "end", key: "not_a_fit" });
  });
});
