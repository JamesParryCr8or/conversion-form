import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local dev uses a plain SQLite file; production uses Turso (libsql://...).
const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
