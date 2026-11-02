import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseFunnel } from "@/lib/funnel/io";
import type { Funnel } from "@/lib/funnel/schema";

/** Published form by public slug. Returns null if missing, unpublished or invalid. */
export async function getPublishedForm(slug: string) {
  const [form] = await db
    .select()
    .from(schema.forms)
    .where(and(eq(schema.forms.slug, slug), eq(schema.forms.status, "published")))
    .limit(1);
  if (!form?.publishedVersionId) return null;

  const [version] = await db
    .select()
    .from(schema.formVersions)
    .where(eq(schema.formVersions.id, form.publishedVersionId))
    .limit(1);
  if (!version) return null;

  const parsed = parseFunnel(version.funnel);
  if (!parsed.ok) return null;
  return { form, versionId: version.id, funnel: parsed.funnel };
}

/** A submission together with the exact funnel version it was started on. */
export async function getSubmissionContext(sid: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(sid)) return null;
  const [submission] = await db.select().from(schema.submissions).where(eq(schema.submissions.id, sid)).limit(1);
  if (!submission) return null;

  const [version] = await db
    .select()
    .from(schema.formVersions)
    .where(eq(schema.formVersions.id, submission.formVersionId))
    .limit(1);
  if (!version) return null;

  const parsed = parseFunnel(version.funnel);
  if (!parsed.ok) return null;
  return { submission, funnel: parsed.funnel as Funnel };
}

/** Only keep tracking params we expect (plus the form's own hidden-field params), bounded in size. */
const TRACKING_PARAM = /^(utm_[a-z0-9_]{1,30}|fbclid|gclid|gbraid|wbraid|ttclid|msclkid|ref|source)$/i;

export function cleanParams(raw: unknown, funnel: Funnel): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const hidden = new Set(funnel.questions.flatMap((q) => (q.type === "hidden" ? [q.param] : [])));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= 30) break;
    if (typeof v !== "string") continue;
    if (!TRACKING_PARAM.test(k) && !hidden.has(k)) continue;
    out[k.slice(0, 60)] = v.trim().slice(0, 200);
  }
  return out;
}

/** Reads a small JSON body, refusing anything oversized or malformed. */
export async function readJson(req: Request, maxBytes = 32_000): Promise<unknown | null> {
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
