import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { validateAnswer, type AnswerValue } from "@/lib/funnel/engine";
import type { Funnel } from "@/lib/funnel/schema";

type Result = { ok: true } | { ok: false; key: string; error: string };

/** Normalise a value before storing (e.g. strip spaces from phone numbers). */
function normalise(type: string, value: unknown): unknown {
  if (typeof value === "string") {
    const v = value.trim();
    return type === "phone" ? v.replace(/\s/g, "") : type === "email" ? v.toLowerCase() : v;
  }
  return value;
}

/**
 * Validate and upsert answers for a submission, mirroring contact fields onto the
 * submission row so they can be filtered on and pushed to GHL. Does not touch status.
 */
export async function saveAnswers(sid: string, funnel: Funnel, incoming: Record<string, unknown>): Promise<Result> {
  const contact: Partial<typeof schema.submissions.$inferInsert> = {};
  const rows: { submissionId: string; questionKey: string; value: unknown }[] = [];

  for (const [key, raw] of Object.entries(incoming)) {
    const q = funnel.questions.find((x) => x.key === key);
    if (!q || q.type === "hidden" || q.type === "statement") return { ok: false, key, error: "Unknown question" };

    const value = normalise(q.type, raw);
    const error = validateAnswer(q, value);
    if (error) return { ok: false, key, error };

    rows.push({ submissionId: sid, questionKey: key, value });
    if (q.type === "email" && typeof value === "string") {
      contact.email = value;
      contact.emailStatus = null; // changed address: any earlier check no longer applies
      contact.emailVerified = false;
    }
    if (q.type === "phone" && typeof value === "string") {
      contact.phoneE164 = value;
      contact.phoneVerified = false;
    }
    if (q.type === "address" && value && typeof value === "object") {
      const a = value as Record<string, string>;
      Object.assign(contact, {
        addressLine1: a.line1 ?? null,
        addressLine2: a.line2 ?? null,
        town: a.town ?? null,
        county: a.county ?? null,
        postcode: a.postcode ?? null,
        country: a.country ?? null,
        uprn: a.uprn ?? null,
      });
    }
  }

  for (const row of rows) {
    await db
      .insert(schema.answers)
      .values({ submissionId: row.submissionId, questionKey: row.questionKey, value: row.value as AnswerValue })
      .onConflictDoUpdate({
        target: [schema.answers.submissionId, schema.answers.questionKey],
        set: { value: row.value as AnswerValue, answeredAt: new Date() },
      });
  }
  if (Object.keys(contact).length) {
    await db.update(schema.submissions).set(contact).where(eq(schema.submissions.id, sid));
  }
  return { ok: true };
}
