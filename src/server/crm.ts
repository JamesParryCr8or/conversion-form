import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildContact, buildNote } from "@/lib/crm/ghl";
import { audit } from "./admin-auth";
import { getSubmissionContext } from "./forms";
import { loadSecrets } from "./secrets";

/**
 * Sends a completed submission to the client's GoHighLevel sub-account:
 *  1. upsert a contact (matched on email by GHL) with name, phone and address
 *  2. add a note with every answer, so nothing is lost even when a question has no GHL field
 * Runs after the visitor's response (see the complete route). Failures are written to the
 * audit log and can be retried from the results page.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TIMEOUT_MS = 10_000;

export type CrmResult = { ok: true; contactId: string | null } | { ok: false; error: string } | { ok: "skipped"; reason: string };

/* ---------------- Sending ---------------- */

async function ghl(path: string, pit: string, method: "POST", body: unknown) {
  return fetch(`${GHL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${pit}`, Version: GHL_VERSION, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

async function ghlError(res: Response) {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? ` ${body.message}` : Array.isArray(body?.message) ? ` ${body.message.join(", ")}` : "";
  return `GHL returned ${res.status}.${message}`.trim();
}

async function recordFailure(submissionId: string, formId: string, subAccountId: string, error: string): Promise<CrmResult> {
  await audit("crm_failed", { submissionId, formId, error }, { subAccountId });
  return { ok: false, error };
}

export async function sendToGhl(submissionId: string): Promise<CrmResult> {
  const found = await getSubmissionContext(submissionId);
  if (!found) return { ok: "skipped", reason: "Submission not found" };
  const { submission, funnel } = found;
  if (submission.status !== "completed") return { ok: "skipped", reason: "Not completed" };
  if (submission.ghlContactId) return { ok: "skipped", reason: "Already sent" };

  const [account] = await db.select().from(schema.subAccounts).where(eq(schema.subAccounts.id, submission.subAccountId)).limit(1);
  const locationId = account?.settings?.ghlLocationId;
  let pit: string | undefined;
  try {
    pit = (await loadSecrets(submission.subAccountId)).ghlPit;
  } catch {
    return recordFailure(submissionId, submission.formId, submission.subAccountId, "The saved GHL token can't be read (the encryption key changed). Re-enter it under Where this client's data goes.");
  }
  if (!locationId || !pit) return { ok: "skipped", reason: "GHL is not set up for this client" };

  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, submission.formId)).limit(1);
  const answerRows = await db.select().from(schema.answers).where(eq(schema.answers.submissionId, submissionId));
  const answers = Object.fromEntries(answerRows.map((r) => [r.questionKey, r.value])) as Record<string, unknown>;

  const contact = buildContact(funnel, submission, answers, form?.slug ?? "");
  if (!contact.email && !contact.phone) {
    return recordFailure(submissionId, submission.formId, submission.subAccountId, "No email or phone number to send to GHL");
  }

  try {
    const res = await ghl("/contacts/upsert", pit, "POST", { locationId, ...contact });
    if (!res.ok) return recordFailure(submissionId, submission.formId, submission.subAccountId, await ghlError(res));
    const data = (await res.json().catch(() => ({}))) as { contact?: { id?: string } };
    const contactId = data.contact?.id;
    if (!contactId) return recordFailure(submissionId, submission.formId, submission.subAccountId, "GHL accepted the request but returned no contact id");

    await db.update(schema.submissions).set({ ghlContactId: contactId, updatedAt: new Date() }).where(eq(schema.submissions.id, submissionId));

    const note = buildNote(funnel, answers, form?.name ?? "CR8OR form", submission.params ?? {});
    const noteRes = await ghl(`/contacts/${encodeURIComponent(contactId)}/notes`, pit, "POST", { body: note });
    if (!noteRes.ok) {
      // The contact is saved, so keep the id. A later retry would only repeat the note.
      await audit("crm_failed", { submissionId, formId: submission.formId, error: `Contact saved, but the note failed. ${await ghlError(noteRes)}` }, { subAccountId: submission.subAccountId });
    }
    return { ok: true, contactId };
  } catch {
    return recordFailure(submissionId, submission.formId, submission.subAccountId, "Couldn't reach GHL. It will be retried from the results page.");
  }
}
