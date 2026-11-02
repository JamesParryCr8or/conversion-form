import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

/* ---------- Auth & tenancy ---------- */

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"), // null = magic link only
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const subAccounts = sqliteTable("sub_accounts", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Europe/London"),
  branding: text("branding", { mode: "json" }).$type<{ logoUrl?: string; primaryColor?: string; font?: string }>(),
  /** Non-secret integration settings (ids that appear in page source anyway). Secrets live in sub_account_secrets. */
  settings: text("settings", { mode: "json" }).$type<Record<string, string>>(),
  plan: text("plan").notNull().default("internal"), // for future self-serve
  createdAt: createdAt(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    subAccountId: text("sub_account_id").notNull().references(() => subAccounts.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
  },
  (t) => [uniqueIndex("memberships_user_account").on(t.userId, t.subAccountId)],
);

export const invites = sqliteTable("invites", {
  id: id(),
  email: text("email").notNull(),
  subAccountId: text("sub_account_id").notNull().references(() => subAccounts.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
});

/**
 * One row per sub-account. `encrypted` holds an AES-GCM blob of the JSON credentials:
 * ghl{pit,locationId}, meta{pixelId,capiToken,testCode}, google{ga4Id,ga4Secret,adsId,adsLabel,gtmId},
 * twilio{accountSid,apiKey,apiSecret,verifyServiceSid,allowedCountries}, addressKeys, webhookUrl.
 * Never sent to the browser.
 */
export const subAccountSecrets = sqliteTable("sub_account_secrets", {
  subAccountId: text("sub_account_id").primaryKey().references(() => subAccounts.id, { onDelete: "cascade" }),
  encrypted: text("encrypted").notNull(),
  updatedAt: updatedAt(),
});

export const auditLog = sqliteTable("audit_log", {
  id: id(),
  subAccountId: text("sub_account_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail", { mode: "json" }),
  createdAt: createdAt(),
});

/* ---------- Forms ---------- */

export const forms = sqliteTable(
  "forms",
  {
    id: id(),
    subAccountId: text("sub_account_id").notNull().references(() => subAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
    draft: text("draft", { mode: "json" }).notNull(), // Funnel JSON (src/lib/funnel/schema.ts)
    publishedVersionId: text("published_version_id"),
    createdFromTemplateId: text("created_from_template_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("forms_sub_account").on(t.subAccountId)],
);

/** Immutable published snapshot, so editing a live form never breaks in-progress sessions. */
export const formVersions = sqliteTable("form_versions", {
  id: id(),
  formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  funnel: text("funnel", { mode: "json" }).notNull(),
  publishedAt: createdAt(),
});

/** GHL field mapping per form: question key -> GHL standard/custom field. Sub-account specific, so NOT in the funnel JSON. */
export const fieldMappings = sqliteTable(
  "field_mappings",
  {
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    ghlField: text("ghl_field").notNull(), // e.g. "email" or custom field id
  },
  (t) => [uniqueIndex("field_mappings_unique").on(t.formId, t.questionKey)],
);

export const templates = sqliteTable("templates", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  thumbnailUrl: text("thumbnail_url"),
  funnel: text("funnel", { mode: "json" }).notNull(),
  visibility: text("visibility", { enum: ["private", "global"] }).notNull().default("private"),
  subAccountId: text("sub_account_id").references(() => subAccounts.id, { onDelete: "cascade" }),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const shareLinks = sqliteTable("share_links", {
  id: id(),
  formId: text("form_id").references(() => forms.id, { onDelete: "cascade" }),
  templateId: text("template_id").references(() => templates.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

/* ---------- Submissions ---------- */

export const submissions = sqliteTable(
  "submissions",
  {
    id: id(), // random, unguessable; created on first view, before any answer
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    subAccountId: text("sub_account_id").notNull().references(() => subAccounts.id, { onDelete: "cascade" }),
    formVersionId: text("form_version_id").notNull().references(() => formVersions.id),
    status: text("status", { enum: ["started", "partial", "completed"] }).notNull().default("started"),
    currentQuestionKey: text("current_question_key"),
    endScreenKey: text("end_screen_key"),
    params: text("params", { mode: "json" }).$type<Record<string, string>>(), // utm_*, fbclid, gclid, custom
    fbp: text("fbp"),
    fbc: text("fbc"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    // Denormalised contact + verification fields
    email: text("email"),
    emailStatus: text("email_status"),
    emailRisk: text("email_risk"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    phoneE164: text("phone_e164"),
    phoneVerified: integer("phone_verified", { mode: "boolean" }).notNull().default(false),
    phoneVerifiedAt: integer("phone_verified_at", { mode: "timestamp_ms" }),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    town: text("town"),
    county: text("county"),
    postcode: text("postcode"),
    country: text("country"),
    uprn: text("uprn"),
    ghlContactId: text("ghl_contact_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("submissions_form").on(t.formId, t.status), index("submissions_account").on(t.subAccountId)],
);

export const answers = sqliteTable(
  "answers",
  {
    submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    value: text("value", { mode: "json" }),
    answeredAt: createdAt(),
  },
  (t) => [uniqueIndex("answers_unique").on(t.submissionId, t.questionKey)],
);

export const verifications = sqliteTable("verifications", {
  id: id(),
  submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["sms", "call", "whatsapp", "email"] }).notNull(),
  target: text("target").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  sendsCount: integer("sends_count").notNull().default(0),
  lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});

export const emailOtps = sqliteTable("email_otps", {
  id: id(),
  submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

/** Cache of GHL email checks so the same address is never billed twice. */
export const emailChecks = sqliteTable(
  "email_checks",
  {
    subAccountId: text("sub_account_id").notNull().references(() => subAccounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    result: text("result"),
    risk: text("risk"),
    reason: text("reason", { mode: "json" }),
    raw: text("raw", { mode: "json" }),
    checkedAt: createdAt(),
  },
  (t) => [uniqueIndex("email_checks_unique").on(t.subAccountId, t.email)],
);

export const eventsLog = sqliteTable(
  "events_log",
  {
    id: id(),
    submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    destination: text("destination", { enum: ["meta", "google", "ghl", "webhook"] }).notNull(),
    eventName: text("event_name"),
    eventId: text("event_id"), // shared with the browser pixel for dedup
    payload: text("payload", { mode: "json" }),
    response: text("response", { mode: "json" }),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("events_submission").on(t.submissionId)],
);
