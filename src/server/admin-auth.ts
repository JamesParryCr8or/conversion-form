import { and, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { signSession, verifySession } from "./crypto";

export const SESSION_COOKIE = "cf_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** The signed-in super admin, or null. Re-checks the database every time, so removing a user ends their session. */
export async function getAdmin() {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.uid)).limit(1);
  return user?.isSuperAdmin ? user : null;
}

/** Call at the top of every admin page, data function and server action. */
export async function requireAdmin() {
  const user = await getAdmin();
  if (!user) redirect("/admin/login");
  return user;
}

export async function startSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ uid: userId }, SESSION_SECONDS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/* ---------- Login throttling (uses the audit log, so it works across serverless instances) ---------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

export async function tooManyLoginFailures(email: string, ip: string | null) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.action, "login_failed"),
        gt(schema.auditLog.createdAt, since),
        sql`(json_extract(${schema.auditLog.detail}, '$.email') = ${email} or json_extract(${schema.auditLog.detail}, '$.ip') = ${ip ?? ""})`,
      ),
    );
  return Number(row?.n ?? 0) >= MAX_FAILURES;
}

export async function audit(action: string, detail: Record<string, unknown>, opts: { userId?: string; subAccountId?: string } = {}) {
  await db.insert(schema.auditLog).values({
    id: nanoid(),
    action,
    userId: opts.userId ?? null,
    subAccountId: opts.subAccountId ?? null,
    detail,
  });
}
