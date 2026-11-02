import { describe, expect, it } from "vitest";
import {
  BLOCKS, addEndScreen, blankFunnel, duplicateQuestion, editorIssues, insertQuestion, keyFromText, moveQuestion,
  newQuestion, normalizeDraft, removeEndScreen, removeQuestion, renameOptionValue, renameQuestionKey, uniqueKey, updateEndScreen, updateQuestion,
} from "./editing";
import { funnelSchema, type Funnel } from "./schema";
import { parseFunnel } from "./io";
import sample from "./templates/lead-gen.json";

const lead = (() => {
  const r = parseFunnel(sample);
  if (!r.ok) throw new Error(r.errors.join());
  return r.funnel;
})();
const valid = (f: Funnel) => funnelSchema.safeParse(f).success;

describe("palette blocks", () => {
  it("every block creates a question that passes validation", () => {
    let f = blankFunnel("Test");
    for (const b of BLOCKS) f = insertQuestion(f, newQuestion(b, f.questions.map((q) => q.key)));
    expect(editorIssues(f).count).toBe(0);
    expect(new Set(f.questions.map((q) => q.key)).size).toBe(f.questions.length); // all keys unique
  });
  it("presets apply (picture choice uses cards, currency has £)", () => {
    const pic = newQuestion(BLOCKS.find((b) => b.id === "picture_choice")!, []);
    const cur = newQuestion(BLOCKS.find((b) => b.id === "currency")!, []);
    expect(pic.type === "single_choice" && pic.layout).toBe("cards");
    expect(cur.type === "number" && cur.prefix).toBe("£");
  });
});

describe("keys", () => {
  it("turns labels into safe keys", () => {
    expect(keyFromText("What's your budget?")).toBe("what_s_your_budget");
    expect(keyFromText("123 go")).toBe("q_123_go");
    expect(keyFromText("Café")).toBe("cafe");
  });
  it("avoids collisions", () => expect(uniqueKey("email", ["email", "email_2"])).toBe("email_3"));
});

describe("reordering and duplicating", () => {
  it("moves a question", () => {
    const f = moveQuestion(lead, 0, 2);
    expect(f.questions.map((q) => q.key).slice(0, 3)).toEqual(["budget", "full_name", "service"]);
  });
  it("duplicates with a fresh key right after the original", () => {
    const f = duplicateQuestion(lead, "budget");
    expect(f.questions[2].key).toBe("budget_2");
    expect(valid(f)).toBe(true);
  });
});

describe("keeping logic consistent", () => {
  it("renaming a question key updates the rules that use it", () => {
    const f = renameQuestionKey(lead, "budget", "monthly_budget")!;
    expect(f.logic[0].after).toBe("monthly_budget");
    expect(f.logic[0].conditions[0].source).toEqual({ kind: "question", key: "monthly_budget" });
    expect(valid(f)).toBe(true);
  });
  it("refuses invalid or duplicate keys", () => {
    expect(renameQuestionKey(lead, "budget", "Bad Key")).toBeNull();
    expect(renameQuestionKey(lead, "budget", "email")).toBeNull();
    expect(renameQuestionKey(lead, "budget", "thanks")).toBeNull(); // clashes with an end screen
  });
  it("deleting a question removes the rules that mention it", () => {
    const f = removeQuestion(lead, "budget");
    expect(f.logic).toEqual([]);
    expect(valid(f)).toBe(true);
  });
  it("renaming a choice value updates conditions on that value", () => {
    const f = renameOptionValue(lead, "budget", "under_1k", "small");
    expect(f.logic[0].conditions[0].value).toBe("small");
    expect(valid(f)).toBe(true);
  });
  it("removing an end screen drops rules that ended there and keeps a default", () => {
    const f = removeEndScreen(lead, "not_a_fit");
    expect(f.logic).toEqual([]);
    expect(f.endScreens.filter((e) => e.isDefault)).toHaveLength(1);
    expect(valid(f)).toBe(true);
  });
  it("never removes the last end screen", () => {
    const one = removeEndScreen(lead, "not_a_fit");
    expect(removeEndScreen(one, "thanks").endScreens).toHaveLength(1);
  });
  it("only one end screen is the default", () => {
    const f = updateEndScreen(addEndScreen(lead), "not_a_fit", { isDefault: true });
    expect(f.endScreens.filter((e) => e.isDefault).map((e) => e.key)).toEqual(["not_a_fit"]);
  });
});

describe("editor validation", () => {
  it("reports problems against the right question", () => {
    const f = updateQuestion(lead, "full_name", { label: "" });
    const issues = editorIssues(f);
    expect(issues.count).toBeGreaterThan(0);
    expect(issues.byQuestion.full_name?.length).toBeGreaterThan(0);
  });
  it("a valid funnel has no issues", () => expect(editorIssues(lead).count).toBe(0));
});

describe("loading drafts", () => {
  it("keeps unfinished work instead of discarding it", () => {
    const unfinished = updateQuestion(lead, "full_name", { label: "" });
    const loaded = normalizeDraft(JSON.parse(JSON.stringify(unfinished)), "x");
    expect(loaded.questions.map((q) => q.key)).toEqual(lead.questions.map((q) => q.key));
    expect(loaded.questions.find((q) => q.key === "full_name")!.label).toBe("");
  });
  it("fills in theme/settings defaults and a fallback ending for junk", () => {
    const loaded = normalizeDraft({ form: { theme: { primaryColor: 123 } } }, "Fallback");
    expect(loaded.form.name).toBe("Fallback");
    expect(loaded.form.theme.primaryColor).toBe("#4f46e5");
    expect(loaded.endScreens).toHaveLength(1);
  });
  it("passes valid funnels through untouched", () => expect(normalizeDraft(lead, "x")).toEqual(lead));
});
