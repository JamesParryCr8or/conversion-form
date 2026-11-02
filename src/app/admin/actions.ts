"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { parseFunnel } from "@/lib/funnel/io";
import starterTemplate from "@/lib/funnel/templates/lead-gen.json";
import { audit, endSession, requireAdmin, startSession, tooManyLoginFailures } from "@/server/admin-auth";
import { createClient, createDraftForm, createPublishedForm } from "@/server/admin-data";
import { blankFunnel } from "@/lib/funnel/editing";
import { SECRET_KEYS, SETTING_KEYS, mergeSecrets, settingsSchema, type ClientSecrets } from "@/server/clients";
import { verifyPassword } from "@/server/crypto";
import { loadSecrets, saveSecrets } from "@/server/secrets";

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> } | null;

const text = (fd: FormData, key: string) => (typeof fd.get(key) === "string" ? (fd.get(key) as string) : "");

/* ---------------- Sign in / out ---------------- */

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = text(fd, "email").trim().toLowerCase().slice(0, 254);
  const password = text(fd, "password").slice(0, 200);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  if (!email || !password) return { error: "Enter your email and password." };
  if (await tooManyLoginFailures(email, ip)) {
    return { error: "Too many failed attempts. Please wait 15 minutes and try again." };
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // Always runs the password check (against a dummy when there is no user) so timing doesn't reveal which emails exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !user.isSuperAdmin || !valid) {
    await audit("login_failed", { email, ip });
    return { error: "That email or password isn't right." };
  }

  await startSession(user.id);
  await audit("login", { email, ip }, { userId: user.id });
  redirect("/admin");
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}

/* ---------------- Clients ---------------- */

export async function createClientAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const name = text(fd, "name").trim();
  if (name.length < 2 || name.length > 80) return { fieldErrors: { name: "Enter the client's name (2 to 80 characters)" } };

  const client = await createClient(name);
  await audit("client_created", { name }, { userId: admin.id, subAccountId: client.id });
  redirect(`/admin/clients/${client.id}`);
}

export async function saveClientAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, id)).limit(1);
  if (!account) return { error: "Client not found." };

  const fieldErrors: Record<string, string> = {};

  const name = text(fd, "name").trim();
  if (name.length < 2 || name.length > 80) fieldErrors.name = "Enter the client's name (2 to 80 characters)";

  const timezone = text(fd, "timezone").trim() || "Europe/London";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    fieldErrors.timezone = "That isn't a valid timezone (e.g. Europe/London)";
  }

  const parsedSettings = settingsSchema.safeParse(Object.fromEntries(SETTING_KEYS.map((k) => [k, text(fd, k)])));
  if (!parsedSettings.success) {
    for (const issue of parsedSettings.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
  }

  let existing: ClientSecrets = {};
  let unreadable = false;
  try {
    existing = await loadSecrets(id);
  } catch {
    unreadable = true; // saved under a different ENCRYPTION_KEY: they have to be re-entered
  }
  const merged = mergeSecrets(
    existing,
    Object.fromEntries(SECRET_KEYS.map((k) => [k, text(fd, `secret_${k}`)])),
    new Set(SECRET_KEYS.filter((k) => fd.get(`remove_${k}`) === "on")),
  );
  if (!merged.ok) {
    for (const [k, msg] of Object.entries(merged.errors)) fieldErrors[`secret_${k}`] = msg;
  }

  if (Object.keys(fieldErrors).length || !parsedSettings.success || !merged.ok) {
    return { error: "Some fields need fixing. Nothing was saved.", fieldErrors };
  }

  // Only keep non-empty settings.
  const settings = Object.fromEntries(Object.entries(parsedSettings.data).filter(([, v]) => v)) as Record<string, string>;
  await db.update(schema.subAccounts).set({ name, timezone, settings }).where(eq(schema.subAccounts.id, id));
  await saveSecrets(id, merged.secrets);

  await audit("client_updated", { settingsKeys: Object.keys(settings), secretsChanged: merged.changed }, { userId: admin.id, subAccountId: id });
  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin");
  return {
    ok: true,
    message: unreadable
      ? "Saved. The previously saved keys couldn't be read (the encryption key changed), so only the keys you entered now are stored."
      : "Saved.",
  };
}

/* ---------------- Connection tests (use SAVED values only, so typed secrets never make an extra trip) ---------------- */

const TIMEOUT = 10_000;

export async function testGhlAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, id)).limit(1);
  if (!account) return { error: "Client not found." };

  const locationId = account.settings?.ghlLocationId;
  let pit: string | undefined;
  try {
    pit = (await loadSecrets(id)).ghlPit;
  } catch {
    return { error: "The saved token can't be read (encryption key changed). Re-enter it and save." };
  }
  if (!locationId || !pit) return { error: "Save a GHL Location ID and private access token first." };

  try {
    const res = await fetch(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`, {
      headers: { Authorization: `Bearer ${pit}`, Version: "2021-07-28", Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { location?: { name?: string }; name?: string };
      const name = body.location?.name ?? body.name;
      return { ok: true, message: name ? `Connected to GHL location "${name}".` : "Connected to GHL." };
    }
    if (res.status === 401) return { error: "GHL rejected the token (401). Check it's a current private integration token." };
    if (res.status === 403) return { error: "The token is valid but not allowed to read this location (403). Add the locations.readonly scope, or check it belongs to this sub-account." };
    if (res.status === 404 || res.status === 422) return { error: "GHL couldn't find that Location ID for this token. Check the Location ID." };
    return { error: `GHL returned an unexpected response (${res.status}).` };
  } catch {
    return { error: "Couldn't reach GHL. Try again in a moment." };
  }
}

export async function testMetaAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(fd, "id");
  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, id)).limit(1);
  if (!account) return { error: "Client not found." };

  const pixelId = account.settings?.metaPixelId;
  let token: string | undefined;
  try {
    token = (await loadSecrets(id)).metaCapiToken;
  } catch {
    return { error: "The saved token can't be read (encryption key changed). Re-enter it and save." };
  }
  if (!pixelId || !token) return { error: "Save a Meta Pixel ID and access token first." };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}?fields=name`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
    if (res.ok) return { ok: true, message: body.name ? `Connected to Meta pixel "${body.name}".` : "Connected to Meta." };
    return { error: `Meta said: ${body.error?.message ?? `error ${res.status}`}` };
  } catch {
    return { error: "Couldn't reach Meta. Try again in a moment." };
  }
}

/* ---------------- Forms ---------------- */

export async function createStarterFormAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  const parsed = parseFunnel(starterTemplate);
  if (!parsed.ok) return { error: "The starter template is invalid." };
  const form = await createPublishedForm(id, parsed.funnel);
  await audit("form_created", { slug: form.slug, from: "starter" }, { userId: admin.id, subAccountId: id });
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true, message: `Created and published "${form.slug}".` };
}

export async function importFormAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  const raw = text(fd, "json");
  if (raw.length > 500_000) return { error: "That file is too large." };

  const parsed = parseFunnel(raw);
  if (!parsed.ok) return { error: `Couldn't import:\n${parsed.errors.slice(0, 6).join("\n")}` };
  const form = await createPublishedForm(id, parsed.funnel);
  await audit("form_created", { slug: form.slug, from: "import" }, { userId: admin.id, subAccountId: id });
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true, message: `Imported and published "${form.slug}".` };
}

export async function setFormStatusAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const formId = text(fd, "formId");
  const status = text(fd, "status") === "published" ? "published" : "draft";
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
  if (!form) return;
  await db.update(schema.forms).set({ status, updatedAt: new Date() }).where(eq(schema.forms.id, formId));
  await audit("form_status", { slug: form.slug, status }, { userId: admin.id, subAccountId: form.subAccountId });
  revalidatePath(`/admin/clients/${form.subAccountId}`);
}

export async function createBlankFormAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  const name = text(fd, "name").trim().slice(0, 120) || "New form";
  const form = await createDraftForm(id, blankFunnel(name));
  await audit("form_created", { slug: form.slug, from: "blank" }, { userId: admin.id, subAccountId: id });
  redirect(`/admin/forms/${form.id}/edit`);
}

/** Permanently delete a form, its versions and ALL its submissions. Only runs when the typed name matches. */
export async function deleteFormAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const formId = text(fd, "formId");
  const typed = text(fd, "confirmName").trim();
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
  if (!form || typed !== form.name) return;

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.submissions)
    .where(eq(schema.submissions.formId, formId));
  await db.delete(schema.forms).where(eq(schema.forms.id, formId)); // cascades to versions, submissions, answers, events
  await audit("form_deleted", { slug: form.slug, name: form.name, submissionsDeleted: Number(n) }, { userId: admin.id, subAccountId: form.subAccountId });
  revalidatePath(`/admin/clients/${form.subAccountId}`);
}
