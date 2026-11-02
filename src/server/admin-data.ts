import { desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { parseFunnel } from "@/lib/funnel/io";
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

export { parseFunnel };
