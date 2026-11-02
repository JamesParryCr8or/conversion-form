import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextStep } from "@/lib/funnel/engine";
import { getSubmissionContext, json, readJson } from "@/server/forms";
import { saveAnswers } from "@/server/answers";

/** Autosave one answer. Marks the submission `partial` and records where the visitor is. */
export async function PUT(req: Request, ctx: RouteContext<"/api/submissions/[sid]/answers">) {
  const { sid } = await ctx.params;
  const found = await getSubmissionContext(sid);
  if (!found) return json({ error: "Not found" }, 404);
  if (found.submission.status === "completed") return json({ error: "Already completed" }, 409);

  const body = (await readJson(req)) as { questionKey?: unknown; value?: unknown } | null;
  if (!body || typeof body.questionKey !== "string") return json({ error: "Bad request" }, 400);

  const result = await saveAnswers(sid, found.funnel, { [body.questionKey]: body.value });
  if (!result.ok) return json({ error: result.error, key: result.key }, 422);

  // The server decides where the visitor is up to, using the same logic as the browser.
  const rows = await db.select().from(schema.answers).where(eq(schema.answers.submissionId, sid));
  const answers = Object.fromEntries(rows.map((r) => [r.questionKey, r.value])) as Record<string, never>;
  const step = nextStep(found.funnel, body.questionKey, answers, found.submission.params ?? {});

  await db
    .update(schema.submissions)
    .set({
      status: "partial",
      currentQuestionKey: step.kind === "question" ? step.key : body.questionKey,
      updatedAt: new Date(),
    })
    .where(eq(schema.submissions.id, sid));

  return json({ ok: true, next: step });
}
