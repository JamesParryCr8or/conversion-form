import { z } from "zod";

/**
 * Portable funnel format. Used for export, import, templates and share links.
 *
 * Rules:
 *  - Questions are referenced by `key`, never by database id, so a funnel is portable.
 *  - NEVER put secrets or sub-account data here (tokens, pixel ids, location ids,
 *    GHL field mappings, submissions). Those live on the sub-account.
 */
export const SCHEMA_VERSION = 1;

const keyRegex = /^[a-z][a-z0-9_]{0,47}$/;
export const keySchema = z
  .string()
  .regex(keyRegex, "Use lowercase letters, numbers and underscores, starting with a letter");

const mediaSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("image"), url: z.string().url(), alt: z.string().max(200).optional() }),
    z.object({ kind: z.literal("icon"), name: z.string().min(1).max(60) }), // Lucide icon name or emoji
  ])
  .optional();

const optionSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  media: mediaSchema,
});

const base = {
  key: keySchema,
  label: z.string().min(1).max(500),
  description: z.string().max(1000).optional(),
  required: z.boolean().default(true),
  media: mediaSchema,
};

export const questionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("short_text"), placeholder: z.string().max(200).optional(), maxLength: z.number().int().positive().optional() }),
  z.object({ ...base, type: z.literal("long_text"), placeholder: z.string().max(200).optional(), maxLength: z.number().int().positive().optional() }),
  z.object({
    ...base,
    type: z.literal("email"),
    deliverabilityCheck: z.boolean().default(true), // GHL Email ISV, once, on leaving the step
    codeVerification: z.boolean().default(false), // optional 6-digit email code
  }),
  z.object({
    ...base,
    type: z.literal("phone"),
    defaultCountry: z.string().length(2).default("gb"),
    preferredCountries: z.array(z.string().length(2)).default(["gb", "ie", "us"]),
    allowedCountries: z.array(z.string().length(2)).optional(), // OTP / fraud allow-list
    verification: z.enum(["off", "optional", "required"]).default("off"),
  }),
  z.object({ ...base, type: z.literal("single_choice"), options: z.array(optionSchema).min(2), layout: z.enum(["buttons", "cards"]).default("buttons"), autoAdvance: z.boolean().default(true) }),
  z.object({ ...base, type: z.literal("multiple_choice"), options: z.array(optionSchema).min(2), min: z.number().int().min(0).optional(), max: z.number().int().positive().optional() }),
  z.object({ ...base, type: z.literal("dropdown"), options: z.array(optionSchema).min(2) }),
  z.object({ ...base, type: z.literal("number"), min: z.number().optional(), max: z.number().optional(), prefix: z.string().max(5).optional(), suffix: z.string().max(10).optional() }),
  z.object({ ...base, type: z.literal("date"), min: z.string().optional(), max: z.string().optional() }),
  z.object({ ...base, type: z.literal("yes_no") }),
  z.object({ ...base, type: z.literal("rating"), scale: z.number().int().min(2).max(10).default(5) }),
  z.object({
    ...base,
    type: z.literal("address"),
    countries: z.enum(["uk", "uk_and_international"]).default("uk"),
  }),
  z.object({ ...base, type: z.literal("consent"), linkText: z.string().max(100).optional(), linkUrl: z.string().url().optional() }),
  z.object({ ...base, type: z.literal("statement"), buttonText: z.string().max(60).default("Continue") }), // no input
  z.object({ ...base, type: z.literal("hidden"), param: z.string().min(1).max(60) }), // filled from a URL parameter
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionType = Question["type"];

/* ---------- Conditional logic ---------- */

export const operatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "is_answered",
  "is_empty",
  "any_of",
]);
export type Operator = z.infer<typeof operatorSchema>;

const conditionSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("question"), key: keySchema }),
    z.object({ kind: z.literal("param"), name: z.string().min(1).max(60) }), // e.g. utm_source
  ]),
  operator: operatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const logicRuleSchema = z.object({
  id: z.string().min(1).max(40),
  after: keySchema, // evaluated when leaving this question
  combinator: z.enum(["and", "or"]).default("and"),
  conditions: z.array(conditionSchema).min(1),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("jump"), to: keySchema }),
    z.object({ type: z.literal("end"), screen: keySchema }),
  ]),
});
export type LogicRule = z.infer<typeof logicRuleSchema>;

/* ---------- Screens, theme, settings ---------- */

export const endScreenSchema = z.object({
  key: keySchema,
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  media: mediaSchema,
  redirectUrl: z.string().url().optional(),
  redirectDelaySeconds: z.number().int().min(0).max(60).default(0),
  isDefault: z.boolean().default(false),
});
export type EndScreen = z.infer<typeof endScreenSchema>;

export const welcomeScreenSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  buttonText: z.string().max(60).default("Start"),
  media: mediaSchema,
});

export const themeSchema = z.object({
  primaryColor: z.string().default("#4f46e5"),
  backgroundColor: z.string().default("#ffffff"),
  textColor: z.string().default("#111827"),
  fontFamily: z.string().default("Inter"),
  buttonStyle: z.enum(["rounded", "pill", "square"]).default("rounded"),
  backgroundImageUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
});

export const settingsSchema = z.object({
  showProgressBar: z.boolean().default(true),
  /** Which moment fires the tracking "Lead" event. */
  leadEventOn: z.enum(["contact_captured", "completed", "verified"]).default("completed"),
  savePartials: z.boolean().default(true),
});

/* ---------- The funnel ---------- */

export const funnelSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    form: z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      settings: settingsSchema.default(() => settingsSchema.parse({})),
      theme: themeSchema.default(() => themeSchema.parse({})),
    }),
    welcome: welcomeScreenSchema.optional(),
    questions: z.array(questionSchema).min(1),
    logic: z.array(logicRuleSchema).default([]),
    endScreens: z.array(endScreenSchema).min(1),
  })
  .superRefine((f, ctx) => {
    const qKeys = new Set<string>();
    f.questions.forEach((q, i) => {
      if (qKeys.has(q.key)) {
        ctx.addIssue({ code: "custom", path: ["questions", i, "key"], message: `Duplicate question key "${q.key}"` });
      }
      qKeys.add(q.key);
    });

    const eKeys = new Set<string>();
    f.endScreens.forEach((e, i) => {
      if (eKeys.has(e.key) || qKeys.has(e.key)) {
        ctx.addIssue({ code: "custom", path: ["endScreens", i, "key"], message: `Key "${e.key}" is already used` });
      }
      eKeys.add(e.key);
    });

    f.logic.forEach((r, i) => {
      if (!qKeys.has(r.after)) {
        ctx.addIssue({ code: "custom", path: ["logic", i, "after"], message: `Unknown question "${r.after}"` });
      }
      r.conditions.forEach((c, j) => {
        if (c.source.kind === "question" && !qKeys.has(c.source.key)) {
          ctx.addIssue({ code: "custom", path: ["logic", i, "conditions", j], message: `Unknown question "${c.source.key}"` });
        }
      });
      if (r.action.type === "jump" && !qKeys.has(r.action.to)) {
        ctx.addIssue({ code: "custom", path: ["logic", i, "action"], message: `Unknown question "${r.action.to}"` });
      }
      if (r.action.type === "end" && !eKeys.has(r.action.screen)) {
        ctx.addIssue({ code: "custom", path: ["logic", i, "action"], message: `Unknown end screen "${r.action.screen}"` });
      }
    });
  });

export type Funnel = z.infer<typeof funnelSchema>;
export type FunnelInput = z.input<typeof funnelSchema>;
