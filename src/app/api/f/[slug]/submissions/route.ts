import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { cleanParams, getPublishedForm, json, readJson } from "@/server/forms";

/** Start a submission. Called on first view, before any answer exists. */
export async function POST(req: Request, ctx: RouteContext<"/api/f/[slug]/submissions">) {
  const { slug } = await ctx.params;
  const published = await getPublishedForm(slug);
  if (!published) return json({ error: "Form not found" }, 404);

  const body = ((await readJson(req)) ?? {}) as { params?: unknown; fbp?: unknown; fbc?: unknown };
  const params = cleanParams(body.params, published.funnel);
  const str = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : null);

  const sid = nanoid(24);
  await db.insert(schema.submissions).values({
    id: sid,
    formId: published.form.id,
    subAccountId: published.form.subAccountId,
    formVersionId: published.versionId,
    status: "started",
    params,
    fbp: str(body.fbp, 200),
    fbc: str(body.fbc, 300),
    ip: str(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(), 64),
    userAgent: str(req.headers.get("user-agent"), 300),
  });

  // Hidden-field questions are answered straight from the URL params.
  const hidden = published.funnel.questions.flatMap((q) =>
    q.type === "hidden" && params[q.param] ? [{ submissionId: sid, questionKey: q.key, value: params[q.param] }] : [],
  );
  if (hidden.length) await db.insert(schema.answers).values(hidden);

  return json({ sid });
}
