import { describe, expect, it } from "vitest";
import { computePath, evaluateCondition, firstStep, nextStep, validateAnswer } from "./engine";
import { parseFunnel } from "./io";
import sample from "./templates/lead-gen.json";

const parsed = parseFunnel(sample);
if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
const funnel = parsed.funnel;
const q = (key: string) => funnel.questions.find((x) => x.key === key)!;

describe("navigation", () => {
  it("starts at the first question", () => {
    expect(firstStep(funnel)).toEqual({ kind: "question", key: "service" });
  });

  it("moves to the next question in order", () => {
    expect(nextStep(funnel, "service", {}, {})).toEqual({ kind: "question", key: "budget" });
  });

  it("follows a logic rule to an end screen", () => {
    expect(nextStep(funnel, "budget", { budget: "under_1k" }, {})).toEqual({ kind: "end", key: "not_a_fit" });
  });

  it("ignores a rule that doesn't match", () => {
    expect(nextStep(funnel, "budget", { budget: "over_5k" }, {})).toEqual({ kind: "question", key: "full_name" });
  });

  it("ends on the default end screen after the last question", () => {
    expect(nextStep(funnel, "consent", {}, {})).toEqual({ kind: "end", key: "thanks" });
  });

  it("supports conditions on URL params", () => {
    expect(
      evaluateCondition({ source: { kind: "param", name: "utm_source" }, operator: "equals", value: "facebook" }, {}, { utm_source: "facebook" }),
    ).toBe(true);
  });

  it("supports any_of on multi-select answers", () => {
    expect(
      evaluateCondition({ source: { kind: "question", key: "x" }, operator: "any_of", value: ["a", "b"] }, { x: ["c", "b"] }, {}),
    ).toBe(true);
  });
});

describe("computePath", () => {
  const full = {
    service: "website",
    budget: "1k_5k",
    full_name: "Sam",
    email: "sam@example.com",
    phone: "+447712345678",
    consent: true,
  };

  it("reaches the end when everything is valid", () => {
    const r = computePath(funnel, full, {});
    expect(r.endKey).toBe("thanks");
    expect(r.missing).toBeNull();
  });

  it("reports the first missing required question", () => {
    const rest: Record<string, unknown> = { ...full };
    delete rest.email;
    expect(computePath(funnel, rest as typeof full, {}).missing).toBe("email");
  });

  it("completes on the not-a-fit path without later answers", () => {
    const r = computePath(funnel, { service: "ads", budget: "under_1k" }, {});
    expect(r.endKey).toBe("not_a_fit");
  });

  it("does not hang on a logic loop", () => {
    const looping = structuredClone(funnel);
    looping.logic = [
      { id: "loop", after: "budget", combinator: "and", conditions: [{ source: { kind: "question", key: "budget" }, operator: "is_answered" }], action: { type: "jump", to: "service" } },
    ];
    expect(computePath(looping, { service: "ads", budget: "over_5k" }, {}).missing).toBe("loop");
  });
});

describe("validateAnswer", () => {
  it("requires required questions", () => {
    expect(validateAnswer(q("full_name"), "")).toBe("This question is required");
  });
  it("checks email format", () => {
    expect(validateAnswer(q("email"), "nope")).not.toBeNull();
    expect(validateAnswer(q("email"), "a@b.co")).toBeNull();
  });
  it("requires real E.164 phone numbers", () => {
    expect(validateAnswer(q("phone"), "07700 900123")).not.toBeNull(); // no country code
    expect(validateAnswer(q("phone"), "+44 7712 345678")).toBeNull();
    expect(validateAnswer(q("phone"), "+44123")).not.toBeNull(); // too short to be real
    expect(validateAnswer(q("phone"), "+4477123456784567")).not.toBeNull(); // too long
    expect(validateAnswer(q("phone"), "+1 555 0100")).not.toBeNull();
  });
  it("enforces a phone country allow-list", () => {
    const uk = { ...q("phone"), allowedCountries: ["gb"] } as typeof funnel.questions[number];
    expect(validateAnswer(uk, "+447712345678")).toBeNull();
    expect(validateAnswer(uk, "+353871234567")).toMatch(/can't accept/); // valid Irish mobile, blocked
  });
  it("only accepts listed choices", () => {
    expect(validateAnswer(q("budget"), "free")).not.toBeNull();
    expect(validateAnswer(q("budget"), "over_5k")).toBeNull();
  });
  it("requires consent to be true", () => {
    expect(validateAnswer(q("consent"), false)).not.toBeNull();
    expect(validateAnswer(q("consent"), true)).toBeNull();
  });
});

describe("image addresses", () => {
  it("accepts https and uploaded /api/media images, rejects others", async () => {
    const { imageUrlSchema } = await import("./schema");
    expect(imageUrlSchema.safeParse("https://cdn.example.com/logo.png").success).toBe(true);
    expect(imageUrlSchema.safeParse("/api/media/forms/abc123/x9Y8z.png").success).toBe(true);
    expect(imageUrlSchema.safeParse("http://insecure.example.com/a.png").success).toBe(false);
    expect(imageUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(imageUrlSchema.safeParse("/api/media/forms/../../secret.png").success).toBe(false);
  });
});
