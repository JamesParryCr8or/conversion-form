import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/* ---------- Secrets at rest: AES-256-GCM ---------- */

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return key;
}

/** Encrypts any JSON value. Output: v1:<iv>:<tag>:<ciphertext> (base64). Tampering is detected on decrypt. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptJson<T>(blob: string): T {
  const [version, iv, tag, data] = blob.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

/* ---------- Passwords: scrypt ---------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Always do the same work, so a missing user can't be told apart by timing.
  const [scheme, salt, hash] = (stored ?? "scrypt:AAAAAAAAAAAAAAAAAAAAAA==:AA==").split(":");
  const expected = Buffer.from(hash ?? "", "base64");
  const actual = await scrypt(password, Buffer.from(salt ?? "", "base64"), expected.length || 64);
  const ok = scheme === "scrypt" && expected.length === actual.length && timingSafeEqual(expected, actual);
  return stored !== null && ok;
}

/* ---------- Session tokens: signed, expiring ---------- */

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is not set (needs 32+ characters)");
  return s;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (body: string) => createHmac("sha256", authSecret()).update(body).digest();

export function signSession(payload: { uid: string }, maxAgeSeconds: number, now = Date.now()): string {
  const body = b64url(JSON.stringify({ uid: payload.uid, exp: Math.floor(now / 1000) + maxAgeSeconds }));
  return `${body}.${b64url(sign(body))}`;
}

export function verifySession(token: string | undefined, now = Date.now()): { uid: string } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof uid !== "string" || typeof exp !== "number" || exp * 1000 < now) return null;
    return { uid };
  } catch {
    return null;
  }
}
