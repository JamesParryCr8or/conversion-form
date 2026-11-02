import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ClientSecrets } from "./clients";
import { decryptJson, encryptJson } from "./crypto";

/**
 * Server-only access to a client's credentials (used by the admin panel's connection tests and,
 * later, by delivery to GHL / Meta / Google). Never import this from a client component and never
 * return its result to the browser.
 */
export async function loadSecrets(subAccountId: string): Promise<ClientSecrets> {
  const [row] = await db.select().from(schema.subAccountSecrets).where(eq(schema.subAccountSecrets.subAccountId, subAccountId)).limit(1);
  return row ? decryptJson<ClientSecrets>(row.encrypted) : {};
}

export async function saveSecrets(subAccountId: string, secrets: ClientSecrets) {
  const encrypted = encryptJson(secrets);
  await db
    .insert(schema.subAccountSecrets)
    .values({ subAccountId, encrypted })
    .onConflictDoUpdate({ target: schema.subAccountSecrets.subAccountId, set: { encrypted, updatedAt: new Date() } });
}

/** Which secrets are set, as booleans only. Safe to send to the browser. */
export async function secretStatus(subAccountId: string): Promise<{ set: Record<string, boolean>; unreadable: boolean }> {
  try {
    const s = await loadSecrets(subAccountId);
    return { set: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Boolean(v)])), unreadable: false };
  } catch {
    return { set: {}, unreadable: true }; // saved with a different ENCRYPTION_KEY
  }
}
