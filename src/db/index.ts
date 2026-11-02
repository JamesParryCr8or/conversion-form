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

const client = createClient({
  url: url ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
