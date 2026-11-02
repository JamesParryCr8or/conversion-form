import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { computePath } from "@/lib/funnel/engine";
import { getSubmissionContext, json, readJson } from "@/server/forms";
import { saveAnswers } from "@/server/answers";

/**
 * Finish a submission. The browser may resend all its answers (covers any autosave that
 * failed); the server then re-walks the funnel itself and only completes if every
 * required question on the path has a valid answer.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[sid]/complete">) {
  const { sid } = await ctx.params;
  const found = await getSubmissionContext(sid);
  if (!found) return json({ error: "Not found" }, 404);
  if (found.submission.status === "completed") {
    return json({ ok: true, endKey: found.submission.endScreenKey });
  }

  const body = (await readJson(req)) as { answers?: unknown } | null;
  if (body?.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
    const saved = await saveAnswers(sid, found.funnel, body.answers as Record<string, unknown>);
    if (!saved.ok) return json({ error: saved.error, key: saved.key }, 422);
  }

  const rows = await db.select().from(schema.answers).where(eq(schema.answers.submissionId, sid));
  const answers = Object.fromEntries(rows.map((r) => [r.questionKey, r.value])) as Record<string, never>;
  const path = computePath(found.funnel, answers, found.submission.params ?? {});

  if (!path.endKey) return json({ error: "Some answers are missing", key: path.missing }, 422);

  const now = new Date();
  await db
    .update(schema.submissions)
    .set({ status: "completed", endScreenKey: path.endKey, completedAt: now, updatedAt: now })
    .where(eq(schema.submissions.id, sid));

  return json({ ok: true, endKey: path.endKey });
}
