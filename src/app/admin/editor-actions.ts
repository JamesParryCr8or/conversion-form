"use server";

import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { findForbidden, parseFunnel } from "@/lib/funnel/io";
import { SCHEMA_VERSION } from "@/lib/funnel/schema";
import { audit, requireAdmin } from "@/server/admin-auth";

type Result = { ok: true; message?: string; url?: string; version?: number } | { ok: false; error: string; errors?: string[] };

async function loadForm(formId: string) {
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
  return form ?? null;
}

/**
 * Autosave. Drafts may be unfinished (that's fine), but must be a reasonably sized object
 * with no secrets in it. Publishing is where full validation happens.
 */
export async function saveDraftAction(formId: string, draft: unknown): Promise<Result> {
  await requireAdmin();
  const form = await loadForm(formId);
  if (!form) return { ok: false, error: "Form not found." };
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return { ok: false, error: "Nothing to save." };

  const json = JSON.stringify(draft);
  if (json.length > 500_000) return { ok: false, error: "This form is too large to save." };
  const forbidden = findForbidden(draft);
  if (forbidden.length) return { ok: false, error: `Remove secrets from the form: ${forbidden[0]}` };

  const value: Record<string, unknown> = { ...(draft as Record<string, unknown>), schemaVersion: SCHEMA_VERSION };
  const name = (value.form as { name?: unknown } | undefined)?.name;
  await db
    .update(schema.forms)
    .set({ draft: value, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : form.name, updatedAt: new Date() })
    .where(eq(schema.forms.id, formId));
  return { ok: true };
}

/** Validate the saved draft and publish it as a new immutable version. In-progress visitors keep their version. */
export async function publishFormAction(formId: string): Promise<Result> {
  const admin = await requireAdmin();
  const form = await loadForm(formId);
  if (!form) return { ok: false, error: "Form not found." };

  const parsed = parseFunnel(form.draft);
  if (!parsed.ok) return { ok: false, error: "Fix these before publishing:", errors: parsed.errors.slice(0, 12) };

  const [latest] = await db
    .select({ version: schema.formVersions.version })
    .from(schema.formVersions)
    .where(eq(schema.formVersions.formId, formId))
    .orderBy(desc(schema.formVersions.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;
  const versionId = nanoid();

  await db.insert(schema.formVersions).values({ id: versionId, formId, version, funnel: parsed.funnel });
  await db
    .update(schema.forms)
    .set({ publishedVersionId: versionId, status: "published", name: parsed.funnel.form.name, draft: parsed.funnel, updatedAt: new Date() })
    .where(eq(schema.forms.id, formId));

  await audit("form_published", { slug: form.slug, version }, { userId: admin.id, subAccountId: form.subAccountId });
  revalidatePath(`/admin/clients/${form.subAccountId}`);
  return { ok: true, version, message: `Published version ${version}.` };
}
