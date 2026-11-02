import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSubmissionContext, json } from "@/server/forms";

/** Resume: returns saved answers and where the visitor got to. The unguessable id is the credential. */
export async function GET(_req: Request, ctx: RouteContext<"/api/submissions/[sid]">) {
  const { sid } = await ctx.params;
  const found = await getSubmissionContext(sid);
  if (!found) return json({ error: "Not found" }, 404);

  const rows = await db.select().from(schema.answers).where(eq(schema.answers.submissionId, sid));
  const answers = Object.fromEntries(rows.map((r) => [r.questionKey, r.value]));

  return json({
    status: found.submission.status,
    currentQuestionKey: found.submission.currentQuestionKey,
    endScreenKey: found.submission.endScreenKey,
    params: found.submission.params ?? {},
    answers,
  });
}
