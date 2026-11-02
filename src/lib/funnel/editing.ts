import { funnelSchema, SCHEMA_VERSION, settingsSchema, themeSchema, type EndScreen, type Funnel, type Question, type QuestionType } from "./schema";

/**
 * Pure editing helpers for the form builder. Every function returns a NEW funnel and keeps
 * logic rules consistent (renames follow through; deletes remove rules that would dangle).
 */

/* ---------------- Palette ---------------- */

export type Block = {
  id: string;
  type: QuestionType;
  label: string;
  group: "Contact" | "Text" | "Choices" | "Numbers & dates" | "Rating" | "Display" | "Other";
  icon: string; // Lucide icon name (see components/editor/icons)
  description: string;
  preset?: Partial<Question>;
};

export const BLOCKS: Block[] = [
  { id: "email", type: "email", label: "Email", group: "Contact", icon: "mail", description: "Format check as they type, then a deliverability check" },
  { id: "phone", type: "phone", label: "Phone number", group: "Contact", icon: "phone", description: "Country flag picker, saved in international format" },
  { id: "address", type: "address", label: "Address", group: "Contact", icon: "map-pin", description: "Address lines, town and postcode" },
  { id: "short_text", type: "short_text", label: "Short answer", group: "Text", icon: "text-cursor", description: "One line of text, e.g. a name" },
  { id: "long_text", type: "long_text", label: "Long answer", group: "Text", icon: "align-left", description: "A paragraph" },
  { id: "single_choice", type: "single_choice", label: "Multiple choice", group: "Choices", icon: "list", description: "Pick one. Moves on as soon as they choose" },
  { id: "picture_choice", type: "single_choice", label: "Picture choice", group: "Choices", icon: "image", description: "Pick one, shown as cards with images or icons", preset: { layout: "cards" } as Partial<Question> },
  { id: "multiple_choice", type: "multiple_choice", label: "Checkboxes", group: "Choices", icon: "list-checks", description: "Pick any number" },
  { id: "dropdown", type: "dropdown", label: "Dropdown", group: "Choices", icon: "chevron-down", description: "Pick one from a long list" },
  { id: "yes_no", type: "yes_no", label: "Yes / No", group: "Choices", icon: "toggle-left", description: "Two buttons" },
  { id: "number", type: "number", label: "Number", group: "Numbers & dates", icon: "hash", description: "A number, with optional limits" },
  { id: "currency", type: "number", label: "Currency", group: "Numbers & dates", icon: "pound-sterling", description: "An amount of money", preset: { prefix: "£", min: 0 } as Partial<Question> },
  { id: "date", type: "date", label: "Date", group: "Numbers & dates", icon: "calendar", description: "A date picker" },
  { id: "star_rating", type: "rating", label: "Star rating", group: "Rating", icon: "star", description: "1 to 5", preset: { scale: 5 } as Partial<Question> },
  { id: "opinion_scale", type: "rating", label: "Opinion scale", group: "Rating", icon: "bar-chart", description: "1 to 10", preset: { scale: 10 } as Partial<Question> },
  { id: "statement", type: "statement", label: "Text / heading", group: "Display", icon: "heading", description: "A message with a Continue button, no answer" },
  { id: "consent", type: "consent", label: "Consent checkbox", group: "Other", icon: "check-square", description: "Agree to be contacted / privacy policy" },
  { id: "hidden", type: "hidden", label: "Hidden field", group: "Other", icon: "eye-off", description: "Filled from a URL parameter, e.g. utm_campaign" },
];

/* ---------------- Keys ---------------- */

export const KEY_RE = /^[a-z][a-z0-9_]{0,47}$/;

export function keyFromText(text: string): string {
  const k = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : `q_${k}`.replace(/_+$/, "") || "q";
}

export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = keyFromText(base) || "q";
  if (!used.has(clean)) return clean;
  for (let i = 2; i < 1000; i++) if (!used.has(`${clean}_${i}`)) return `${clean}_${i}`;
  return `${clean}_${Date.now()}`;
}

export const allKeys = (f: Funnel) => [...f.questions.map((q) => q.key), ...f.endScreens.map((e) => e.key)];

/* ---------------- New things ---------------- */

const DEFAULT_LABELS: Record<QuestionType, string> = {
  short_text: "What's your name?",
  long_text: "Tell us a bit more",
  email: "What's your email address?",
  phone: "What's your phone number?",
  single_choice: "Which option fits best?",
  multiple_choice: "Select all that apply",
  dropdown: "Choose one",
  number: "How many?",
  date: "Pick a date",
  yes_no: "Yes or no?",
  rating: "How would you rate us?",
  address: "What's your address?",
  consent: "I agree to be contacted about my enquiry",
  statement: "A quick note before we continue",
  hidden: "Hidden field",
};

const KEY_BASE: Partial<Record<QuestionType, string>> = { email: "email", phone: "phone", address: "address", consent: "consent", hidden: "utm_campaign" };

export function newQuestion(block: Block, taken: Iterable<string>): Question {
  const key = uniqueKey(KEY_BASE[block.type] ?? block.id, taken);
  const base = { key, label: DEFAULT_LABELS[block.type], required: block.type !== "hidden" && block.type !== "statement", sameScreen: false };
  const options = () => [
    { value: "option_1", label: "Option 1" },
    { value: "option_2", label: "Option 2" },
  ];
  const q = (() => {
    switch (block.type) {
      case "single_choice":
        return { ...base, type: "single_choice", options: options(), layout: "buttons", autoAdvance: true };
      case "multiple_choice":
        return { ...base, type: "multiple_choice", options: options() };
      case "dropdown":
        return { ...base, type: "dropdown", options: options() };
      case "email":
        return { ...base, type: "email", deliverabilityCheck: true, codeVerification: false };
      case "phone":
        return { ...base, type: "phone", defaultCountry: "gb", preferredCountries: ["gb", "ie", "us"], verification: "off" };
      case "rating":
        return { ...base, type: "rating", scale: 5 };
      case "address":
        return { ...base, type: "address", countries: "uk" };
      case "statement":
        return { ...base, type: "statement", buttonText: "Continue" };
      case "hidden":
        return { ...base, type: "hidden", param: "utm_campaign" };
      default:
        return { ...base, type: block.type };
    }
  })();
  return { ...q, ...(block.preset ?? {}) } as Question;
}

export function blankFunnel(name: string): Funnel {
  return funnelSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    form: { name },
    questions: [{ key: "full_name", type: "short_text", label: "What's your name?" }],
    endScreens: [{ key: "thanks", title: "Thanks, we'll be in touch soon", isDefault: true }],
  });
}

/* ---------------- Questions ---------------- */

export function insertQuestion(f: Funnel, q: Question, index = f.questions.length): Funnel {
  const questions = [...f.questions];
  questions.splice(Math.max(0, Math.min(index, questions.length)), 0, q);
  return { ...f, questions };
}

export function moveQuestion(f: Funnel, from: number, to: number): Funnel {
  if (from === to || from < 0 || from >= f.questions.length) return f;
  const questions = [...f.questions];
  const [q] = questions.splice(from, 1);
  questions.splice(Math.max(0, Math.min(to, questions.length)), 0, q);
  return { ...f, questions };
}

export function updateQuestion(f: Funnel, key: string, patch: Partial<Question>): Funnel {
  return { ...f, questions: f.questions.map((q) => (q.key === key ? ({ ...q, ...patch } as Question) : q)) };
}

export function duplicateQuestion(f: Funnel, key: string): Funnel {
  const i = f.questions.findIndex((q) => q.key === key);
  if (i < 0) return f;
  const copy = { ...structuredClone(f.questions[i]), key: uniqueKey(key, allKeys(f)) } as Question;
  return insertQuestion(f, copy, i + 1);
}

/** Remove a question and every logic rule that mentions it (so nothing points at a missing question). */
export function removeQuestion(f: Funnel, key: string): Funnel {
  return {
    ...f,
    questions: f.questions.filter((q) => q.key !== key),
    logic: f.logic.filter(
      (r) =>
        r.after !== key &&
        !(r.action.type === "jump" && r.action.to === key) &&
        !r.conditions.some((c) => c.source.kind === "question" && c.source.key === key),
    ),
  };
}

/** Rename a question key everywhere it is referenced. Returns null if the new key is invalid or taken. */
export function renameQuestionKey(f: Funnel, from: string, to: string): Funnel | null {
  if (from === to) return f;
  if (!KEY_RE.test(to) || allKeys(f).includes(to)) return null;
  return {
    ...f,
    questions: f.questions.map((q) => (q.key === from ? ({ ...q, key: to } as Question) : q)),
    logic: f.logic.map((r) => ({
      ...r,
      after: r.after === from ? to : r.after,
      conditions: r.conditions.map((c) =>
        c.source.kind === "question" && c.source.key === from ? { ...c, source: { kind: "question" as const, key: to } } : c,
      ),
      action: r.action.type === "jump" && r.action.to === from ? { ...r.action, to } : r.action,
    })),
  };
}

/** Change a choice's stored value and update logic conditions that compare against it. */
export function renameOptionValue(f: Funnel, questionKey: string, from: string, to: string): Funnel {
  const swap = (v: unknown) => (v === from ? to : v);
  return {
    ...f,
    questions: f.questions.map((q) =>
      q.key === questionKey && "options" in q
        ? ({ ...q, options: q.options.map((o) => (o.value === from ? { ...o, value: to } : o)) } as Question)
        : q,
    ),
    logic: f.logic.map((r) => ({
      ...r,
      conditions: r.conditions.map((c) =>
        c.source.kind === "question" && c.source.key === questionKey
          ? { ...c, value: Array.isArray(c.value) ? c.value.map((v) => String(swap(v))) : (swap(c.value) as typeof c.value) }
          : c,
      ),
    })),
  };
}

/* ---------------- End screens ---------------- */

export function addEndScreen(f: Funnel): Funnel {
  const key = uniqueKey("ending", allKeys(f));
  const end: EndScreen = { key, title: "Thanks!", redirectDelaySeconds: 0, isDefault: f.endScreens.length === 0 };
  return { ...f, endScreens: [...f.endScreens, end] };
}

export function updateEndScreen(f: Funnel, key: string, patch: Partial<EndScreen>): Funnel {
  let endScreens = f.endScreens.map((e) => (e.key === key ? { ...e, ...patch } : e));
  if (patch.isDefault) endScreens = endScreens.map((e) => ({ ...e, isDefault: e.key === key }));
  return { ...f, endScreens };
}

/** Remove an end screen (never the last one). Rules that ended there are removed; a new default is chosen if needed. */
export function removeEndScreen(f: Funnel, key: string): Funnel {
  if (f.endScreens.length <= 1) return f;
  let endScreens = f.endScreens.filter((e) => e.key !== key);
  if (!endScreens.some((e) => e.isDefault)) endScreens = endScreens.map((e, i) => ({ ...e, isDefault: i === 0 }));
  return { ...f, endScreens, logic: f.logic.filter((r) => !(r.action.type === "end" && r.action.screen === key)) };
}

/* ---------------- Validation for the editor ---------------- */

export type EditorIssues = {
  count: number;
  byQuestion: Record<string, string[]>;
  byEnd: Record<string, string[]>;
  byRule: Record<string, string[]>;
  general: string[];
};

export function editorIssues(f: Funnel): EditorIssues {
  const out: EditorIssues = { count: 0, byQuestion: {}, byEnd: {}, byRule: {}, general: [] };
  const r = funnelSchema.safeParse(f);
  if (r.success) return out;
  for (const issue of r.error.issues) {
    out.count++;
    const [section, index, ...rest] = issue.path;
    const where = rest.length ? `${rest.join(" › ")}: ` : "";
    const msg = `${where}${issue.message}`;
    if (section === "questions" && typeof index === "number" && f.questions[index]) {
      (out.byQuestion[f.questions[index].key] ??= []).push(msg);
    } else if (section === "endScreens" && typeof index === "number" && f.endScreens[index]) {
      (out.byEnd[f.endScreens[index].key] ??= []).push(msg);
    } else if (section === "logic" && typeof index === "number" && f.logic[index]) {
      (out.byRule[f.logic[index].id] ??= []).push(msg);
    } else {
      out.general.push(`${issue.path.join(" › ") || "Form"}: ${issue.message}`);
    }
  }
  return out;
}

/* ---------------- Loading drafts ---------------- */

/**
 * Turn whatever is stored as a draft into something the editor can show, WITHOUT throwing away
 * work that isn't valid yet (an empty label, a half-built rule). Valid drafts pass straight through.
 */
export function normalizeDraft(raw: unknown, fallbackName: string): Funnel {
  const ok = funnelSchema.safeParse(raw);
  if (ok.success) return ok.data;
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const form = (r.form && typeof r.form === "object" ? r.form : {}) as Record<string, unknown>;
  const ends = Array.isArray(r.endScreens) && r.endScreens.length ? r.endScreens : [{ key: "thanks", title: "Thanks!", isDefault: true, redirectDelaySeconds: 0 }];
  return {
    schemaVersion: SCHEMA_VERSION,
    form: {
      name: typeof form.name === "string" ? form.name : fallbackName,
      description: typeof form.description === "string" ? form.description : undefined,
      settings: settingsSchema.catch(settingsSchema.parse({})).parse(form.settings ?? {}),
      theme: themeSchema.catch(themeSchema.parse({})).parse(form.theme ?? {}),
    },
    welcome: (r.welcome ?? undefined) as Funnel["welcome"],
    questions: (Array.isArray(r.questions) ? r.questions : []) as Funnel["questions"],
    logic: (Array.isArray(r.logic) ? r.logic : []) as Funnel["logic"],
    endScreens: ends as Funnel["endScreens"],
  };
}

export const newRuleId = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
