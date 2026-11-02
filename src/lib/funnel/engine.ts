import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { Condition, Funnel, Question } from "./schema";

/**
 * Pure navigation + validation logic. Shared by the browser renderer, the server
 * (which re-checks everything on save/complete) and, later, the editor preview.
 */

export type AnswerValue = string | number | boolean | string[] | Record<string, string> | null;
export type Answers = Record<string, AnswerValue | undefined>;
export type Params = Record<string, string>;
export type Step = { kind: "question"; key: string } | { kind: "end"; key: string };

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/* ---------------- Conditions ---------------- */

function looseEquals(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
  if (isEmpty(actual)) return false;
  return String(actual) === String(expected);
}

export function evaluateCondition(c: Condition, answers: Answers, params: Params): boolean {
  const actual = c.source.kind === "question" ? answers[c.source.key] : params[c.source.name];
  switch (c.operator) {
    case "is_answered":
      return !isEmpty(actual);
    case "is_empty":
      return isEmpty(actual);
    case "equals":
      return looseEquals(actual, c.value);
    case "not_equals":
      return !looseEquals(actual, c.value);
    case "contains":
      if (Array.isArray(actual)) return actual.map(String).includes(String(c.value));
      return typeof actual === "string" && actual.toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "greater_than":
      return !isEmpty(actual) && Number(actual) > Number(c.value);
    case "less_than":
      return !isEmpty(actual) && Number(actual) < Number(c.value);
    case "any_of": {
      const options = Array.isArray(c.value) ? c.value.map(String) : [];
      if (Array.isArray(actual)) return actual.some((a) => options.includes(String(a)));
      return !isEmpty(actual) && options.includes(String(actual));
    }
  }
}

/* ---------------- Navigation ---------------- */

export const isNavigable = (q: Question) => q.type !== "hidden";

export function defaultEndKey(funnel: Funnel): string {
  return (funnel.endScreens.find((e) => e.isDefault) ?? funnel.endScreens[0]).key;
}

/** Visible questions grouped into screens. A question with sameScreen joins the screen above it. */
export function screens(funnel: Funnel): string[][] {
  const out: string[][] = [];
  for (const q of funnel.questions) {
    if (!isNavigable(q)) continue;
    if (q.sameScreen && out.length) out[out.length - 1].push(q.key);
    else out.push([q.key]);
  }
  return out;
}

/** Every question key on the same screen as `key` (or just [key] if unknown). */
export function screenOf(funnel: Funnel, key: string): string[] {
  return screens(funnel).find((s) => s.includes(key)) ?? [key];
}

/** The first question on the screen that `key` belongs to. */
export function screenHead(funnel: Funnel, key: string): string {
  return screenOf(funnel, key)[0];
}

export function firstStep(funnel: Funnel): Step {
  const first = screens(funnel)[0]?.[0];
  return first ? { kind: "question", key: first } : { kind: "end", key: defaultEndKey(funnel) };
}

/** Where to go after the screen containing `currentKey`. Logic rules (checked on the screen's last question) win. */
export function nextStep(funnel: Funnel, currentKey: string, answers: Answers, params: Params): Step {
  const onScreen = screenOf(funnel, currentKey);
  for (const rule of funnel.logic) {
    if (!onScreen.includes(rule.after)) continue;
    const results = rule.conditions.map((c) => evaluateCondition(c, answers, params));
    const matched = rule.combinator === "or" ? results.some(Boolean) : results.every(Boolean);
    if (!matched) continue;
    return rule.action.type === "jump"
      ? { kind: "question", key: rule.action.to }
      : { kind: "end", key: rule.action.screen };
  }
  const all = screens(funnel);
  const idx = all.findIndex((s) => s.includes(currentKey));
  const next = all[idx + 1]?.[0];
  return next ? { kind: "question", key: next } : { kind: "end", key: defaultEndKey(funnel) };
}

export function computePath(funnel: Funnel, answers: Answers, params: Params) {
  const path: string[] = [];
  let step = firstStep(funnel);
  for (let guard = 0; guard < funnel.questions.length * 4 + 10; guard++) {
    if (step.kind === "end") return { path, endKey: step.key, missing: null as string | null };
    const keys = screenOf(funnel, step.key);
    if (!funnel.questions.some((x) => x.key === step.key)) return { path, endKey: null, missing: step.key };
    for (const key of keys) {
      const q = funnel.questions.find((x) => x.key === key)!;
      path.push(q.key);
      const needsAnswer = q.type !== "statement";
      if (needsAnswer && (q.required || !isEmpty(answers[q.key]))) {
        if (validateAnswer(q, answers[q.key]) !== null) return { path, endKey: null, missing: q.key };
      }
    }
    step = nextStep(funnel, keys[keys.length - 1], answers, params);
  }
  return { path, endKey: null, missing: "loop" as string | null }; // logic loop; never completes
}

/* ---------------- Validation ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns an error message, or null if the value is acceptable. */
export function validateAnswer(q: Question, value: unknown): string | null {
  if (q.type === "statement" || q.type === "hidden") return null;

  const required = "required" in q ? q.required : true;
  const empty = isEmpty(value) || (q.type === "consent" && value !== true);
  if (empty) return required ? "This question is required" : null;

  switch (q.type) {
    case "short_text":
    case "long_text": {
      if (typeof value !== "string") return "Enter some text";
      const max = q.maxLength ?? (q.type === "short_text" ? 500 : 5000);
      return value.length > max ? `Keep it under ${max} characters` : null;
    }
    case "email":
      return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim())
        ? null
        : "Enter a valid email address";
    case "phone": {
      // Same check in the browser and on the server (libphonenumber-js), per docs/validation-services.md section 4.
      const parsed = typeof value === "string" && E164_RE.test(value.replace(/\s/g, ""))
        ? parsePhoneNumberFromString(value.replace(/\s/g, ""))
        : undefined;
      if (!parsed?.isValid()) return "Enter a valid phone number";
      const allowed = q.allowedCountries?.map((c) => c.toUpperCase());
      if (allowed?.length && !allowed.includes(parsed.country ?? "")) return "We can't accept phone numbers from that country";
      return null;
    }
    case "single_choice":
    case "dropdown":
      return typeof value === "string" && q.options.some((o) => o.value === value) ? null : "Choose one of the options";
    case "multiple_choice": {
      if (!Array.isArray(value) || !value.every((v) => q.options.some((o) => o.value === v))) return "Choose from the options";
      if (q.min !== undefined && value.length < q.min) return `Choose at least ${q.min}`;
      if (q.max !== undefined && value.length > q.max) return `Choose no more than ${q.max}`;
      return null;
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return "Enter a number";
      if (q.min !== undefined && n < q.min) return `Must be at least ${q.min}`;
      if (q.max !== undefined && n > q.max) return `Must be no more than ${q.max}`;
      return null;
    }
    case "date":
      if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) return "Enter a valid date";
      if (q.min && value < q.min) return "That date is too early";
      if (q.max && value > q.max) return "That date is too late";
      return null;
    case "yes_no":
      return typeof value === "boolean" ? null : "Choose yes or no";
    case "rating":
      return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= q.scale ? null : "Choose a rating";
    case "address": {
      if (typeof value !== "object" || Array.isArray(value)) return "Enter your address";
      const a = value as Record<string, string>;
      return a.line1 && a.postcode ? null : "Enter your address and postcode";
    }
    case "consent":
      return value === true ? null : "This question is required";
  }
}
