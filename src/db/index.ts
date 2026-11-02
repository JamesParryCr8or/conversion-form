import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local dev uses a plain SQLite file; production uses Turso (libsql://...).
// In production we refuse to fall back to a local file: on Vercel that would silently
// be an empty database. (Skipped during `next build`, which doesn't query the database.)
const url = process.env.TURSO_DATABASE_URL;
if (!url && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("TURSO_DATABASE_URL is not set. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to the environment.");
}

// One line per server start, visible in Vercel runtime logs. Host and flags only, never the token.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  const host = url?.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "") ?? "(local file)";
  console.info(`[db] host=${host} tokenSet=${Boolean(process.env.TURSO_AUTH_TOKEN)} vercelEnv=${process.env.VERCEL_ENV ?? "none"}`);
}

const client = createClient({
  url: url ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
