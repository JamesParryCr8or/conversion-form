import type { Question } from "./schema";

/**
 * Turn a stored answer into readable text, for the results page and CRM notes.
 * Choice answers show the option label, not its internal value.
 */
export function formatAnswer(q: Question, value: unknown): string {
  if (q.type === "statement" || q.type === "hidden") return "";
  if (value === undefined || value === null || value === "") return "";

  switch (q.type) {
    case "consent":
      return value === true ? "Agreed" : "Not agreed";
    case "yes_no":
      return value === true ? "Yes" : value === false ? "No" : String(value);
    case "single_choice":
    case "dropdown": {
      const option = q.options.find((o) => o.value === value);
      return option ? option.label : String(value);
    }
    case "multiple_choice": {
      if (!Array.isArray(value)) return String(value);
      return value.map((v) => q.options.find((o) => o.value === v)?.label ?? String(v)).join(", ");
    }
    case "rating":
      return `${value} / ${q.scale}`;
    case "address": {
      if (typeof value !== "object" || Array.isArray(value)) return String(value);
      const a = value as Record<string, string | undefined>;
      return [a.line1, a.line2, a.town, a.county, a.postcode, a.country].filter(Boolean).join(", ");
    }
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}
