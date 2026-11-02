import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { parseFunnel } from "@/lib/funnel/io";
import { formatAnswer } from "@/lib/funnel/format";
import type { Funnel } from "@/lib/funnel/schema";
import { requireAdmin } from "./admin-auth";
import { slugify, type ClientSettings } from "./clients";
import { secretStatus } from "./secrets";

export async function listClients() {
  await requireAdmin();
  const accounts = await db.select().from(schema.subAccounts).orderBy(desc(schema.subAccounts.createdAt));
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id);

  const forms = await db
    .select({ id: schema.forms.subAccountId, n: sql<number>`count(*)` })
    .from(schema.forms)
    .where(inArray(schema.forms.subAccountId, ids))
    .groupBy(schema.forms.subAccountId);
  const subs = await db
    .select({
      id: schema.submissions.subAccountId,
      total: sql<number>`count(*)`,
      done: sql<number>`sum(case when ${schema.submissions.status} = 'completed' then 1 else 0 end)`,
    })
    .from(schema.submissions)
    .where(inArray(schema.submissions.subAccountId, ids))
    .groupBy(schema.submissions.subAccountId);

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    forms: Number(forms.find((f) => f.id === a.id)?.n ?? 0),
    submissions: Number(subs.find((s) => s.id === a.id)?.total ?? 0),
    completed: Number(subs.find((s) => s.id === a.id)?.done ?? 0),
    ghlConnected: Boolean(a.settings?.ghlLocationId),
    metaConnected: Boolean(a.settings?.metaPixelId),
  }));
}

/** Everything the client page needs. Secrets are reported as booleans only. */
export async function getClientView(id: string) {
  await requireAdmin();
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, id)).limit(1);
  if (!account) return null;

  const forms = await db.select().from(schema.forms).where(eq(schema.forms.subAccountId, id)).orderBy(desc(schema.forms.createdAt));
  const counts = forms.length
    ? await db
        .select({ formId: schema.submissions.formId, total: sql<number>`count(*)`, done: sql<number>`sum(case when ${schema.submissions.status} = 'completed' then 1 else 0 end)` })
        .from(schema.submissions)
        .where(inArray(schema.submissions.formId, forms.map((f) => f.id)))
        .groupBy(schema.submissions.formId)
    : [];

  return {
    account: {
      id: account.id,
      name: account.name,
      slug: account.slug,
      timezone: account.timezone,
      settings: (account.settings ?? {}) as Partial<ClientSettings>,
    },
    secrets: await secretStatus(id),
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      status: f.status,
      published: Boolean(f.publishedVersionId),
      total: Number(counts.find((c) => c.formId === f.id)?.total ?? 0),
      completed: Number(counts.find((c) => c.formId === f.id)?.done ?? 0),
    })),
  };
}

/** Find a free public slug for a new form: client-form-name, then -2, -3 ... */
async function freeFormSlug(clientSlug: string, formName: string) {
  const base = `${clientSlug}-${slugify(formName)}`.slice(0, 60);
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const [taken] = await db.select({ id: schema.forms.id }).from(schema.forms).where(eq(schema.forms.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
}

/** Create a form for a client from a validated funnel, and publish it as version 1. */
export async function createPublishedForm(subAccountId: string, funnel: Funnel) {
  await requireAdmin();
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, subAccountId)).limit(1);
  if (!account) throw new Error("Client not found");

  const formId = nanoid();
  const versionId = nanoid();
  const slug = await freeFormSlug(account.slug, funnel.form.name);

  await db.insert(schema.forms).values({
    id: formId, subAccountId, name: funnel.form.name, slug, status: "published", draft: funnel, publishedVersionId: versionId,
  });
  await db.insert(schema.formVersions).values({ id: versionId, formId, version: 1, funnel });
  return { id: formId, slug };
}

export async function createClient(name: string) {
  await requireAdmin();
  const base = slugify(name);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [taken] = await db.select({ id: schema.subAccounts.id }).from(schema.subAccounts).where(eq(schema.subAccounts.slug, slug)).limit(1);
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  const id = nanoid();
  await db.insert(schema.subAccounts).values({ id, name, slug, settings: {} });
  return { id, slug };
}

/** Create a form for a client as an unpublished draft (opened straight in the builder). */
export async function createDraftForm(subAccountId: string, funnel: Funnel) {
  await requireAdmin();
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, subAccountId)).limit(1);
  if (!account) throw new Error("Client not found");
  const id = nanoid();
  const slug = await freeFormSlug(account.slug, funnel.form.name);
  await db.insert(schema.forms).values({ id, subAccountId, name: funnel.form.name, slug, status: "draft", draft: funnel, publishedVersionId: null });
  return { id, slug };
}

/** Everything the builder needs for one form. */
export async function getFormForEdit(formId: string) {
  await requireAdmin();
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
  if (!form) return null;
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, form.subAccountId)).limit(1);
  const [published] = form.publishedVersionId
    ? await db.select().from(schema.formVersions).where(eq(schema.formVersions.id, form.publishedVersionId)).limit(1)
    : [];
  return {
    id: form.id,
    slug: form.slug,
    status: form.status,
    draft: form.draft as unknown,
    publishedVersion: published?.version ?? null,
    hasUnpublishedChanges: !published || JSON.stringify(published.funnel) !== JSON.stringify(form.draft),
    client: { id: account?.id ?? "", name: account?.name ?? "" },
  };
}

export type ResultRow = {
  id: string;
  createdAt: Date;
  status: "started" | "partial" | "completed";
  answers: Record<string, string>;
  params: Record<string, string>;
  crm: "sent" | "failed" | "not_sent" | "n/a";
  crmError: string | null;
};

/** Submissions for one form, with each answer as readable text. Secrets are never read here. */
export async function getFormResults(formId: string) {
  await requireAdmin();
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
  if (!form) return null;
  const [published] = form.publishedVersionId
    ? await db.select().from(schema.formVersions).where(eq(schema.formVersions.id, form.publishedVersionId)).limit(1)
    : [];
  const parsed = parseFunnel(published?.funnel ?? form.draft);
  if (!parsed.ok) return null;
  const funnel = parsed.funnel;
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, form.subAccountId)).limit(1);
  const crmConfigured = Boolean(account?.settings?.ghlLocationId) && (await secretStatus(form.subAccountId)).set.ghlPit === true;

  const subs = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.formId, formId))
    .orderBy(desc(schema.submissions.createdAt))
    .limit(300);
  const answerRows = subs.length
    ? await db.select().from(schema.answers).where(inArray(schema.answers.submissionId, subs.map((s) => s.id)))
    : [];

  // Latest CRM failure per submission (audit rows come back newest first).
  const failures = new Map<string, string>();
  const failedRows = await db
    .select({ detail: schema.auditLog.detail })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.subAccountId, form.subAccountId), eq(schema.auditLog.action, "crm_failed")))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(500);
  for (const row of failedRows) {
    const d = row.detail as { submissionId?: string; error?: string } | null;
    if (d?.submissionId && d.error && !failures.has(d.submissionId)) failures.set(d.submissionId, d.error);
  }

  // Columns: the current questions in order, then any extra keys from older versions.
  const shown = funnel.questions.filter((q) => q.type !== "statement" && q.type !== "hidden");
  const columns = shown.map((q) => ({ key: q.key, label: q.label }));
  const extraKeys = [...new Set(answerRows.map((a) => a.questionKey))].filter((k) => !shown.some((q) => q.key === k));
  for (const k of extraKeys) columns.push({ key: k, label: k });

  const rows: ResultRow[] = subs.map((s) => {
    const mine = answerRows.filter((a) => a.submissionId === s.id);
    const answers: Record<string, string> = {};
    for (const a of mine) {
      const q = funnel.questions.find((x) => x.key === a.questionKey);
      answers[a.questionKey] = q ? formatAnswer(q, a.value) : String(a.value ?? "");
    }
    const crmError = failures.get(s.id) ?? null;
    const crm: ResultRow["crm"] = s.ghlContactId
      ? "sent"
      : s.status !== "completed"
        ? "n/a"
        : !crmConfigured
          ? "n/a"
          : crmError
            ? "failed"
            : "not_sent";
    return { id: s.id, createdAt: s.createdAt, status: s.status, answers, params: s.params ?? {}, crm, crmError };
  });

  return {
    form: { id: form.id, name: form.name, slug: form.slug, status: form.status, subAccountId: form.subAccountId },
    columns,
    crmConfigured,
    summary: {
      total: subs.length,
      completed: subs.filter((s) => s.status === "completed").length,
      inProgress: subs.filter((s) => s.status !== "completed").length,
      sentToCrm: subs.filter((s) => Boolean(s.ghlContactId)).length,
    },
    rows,
  };
}

export { parseFunnel };
