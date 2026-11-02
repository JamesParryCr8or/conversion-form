import { funnelSchema, SCHEMA_VERSION, type Funnel } from "./schema";

export type ImportResult =
  | { ok: true; funnel: Funnel }
  | { ok: false; errors: string[] };

/** Fields that must never appear in a portable funnel. */
const FORBIDDEN_SUBSTRINGS = ["token", "secret", "apikey", "api_key", "locationid", "location_id", "pixelid", "pixel_id", "password"];
const FORBIDDEN_EXACT = ["pit"];
const isForbidden = (key: string) => {
  const k = key.toLowerCase();
  return FORBIDDEN_EXACT.includes(k) || FORBIDDEN_SUBSTRINGS.some((s) => k.includes(s));
};

function findForbidden(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findForbidden(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => {
      const here = path ? `${path}.${k}` : k;
      const hit = isForbidden(k) ? [`Not allowed in a funnel file: "${here}"`] : [];
      return [...hit, ...findForbidden(v, here)];
    });
  }
  return [];
}

/** Upgrade older exports to the current schema. Add one step per version bump. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`This file was made by a newer version (schema ${version}). Update the app to import it.`);
  }
  // if (version < 2) { raw = migrateV1toV2(raw) } ...
  return raw;
}

export function parseFunnel(input: string | unknown): ImportResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["That isn't valid JSON."] };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["Expected a funnel object."] };
  }

  const forbidden = findForbidden(raw);
  if (forbidden.length) return { ok: false, errors: forbidden };

  let migrated: Record<string, unknown>;
  try {
    migrated = migrate(raw as Record<string, unknown>);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }

  const result = funnelSchema.safeParse(migrated);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, funnel: result.data };
}

export function exportFunnel(funnel: Funnel): string {
  return JSON.stringify({ ...funnel, schemaVersion: SCHEMA_VERSION }, null, 2);
}
