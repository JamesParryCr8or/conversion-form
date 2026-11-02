import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptJson, encryptJson, hashPassword, signSession, verifyPassword, verifySession } from "./crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.AUTH_SECRET = randomBytes(48).toString("base64url");
});

describe("secret encryption", () => {
  it("round-trips", () => {
    const secrets = { ghlPit: "pit-abc", metaCapiToken: "EAAB123" };
    expect(decryptJson(encryptJson(secrets))).toEqual(secrets);
  });
  it("never contains the plaintext", () => {
    expect(encryptJson({ ghlPit: "pit-super-secret" })).not.toContain("pit-super-secret");
  });
  it("uses a fresh nonce each time", () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });
  it("detects tampering", () => {
    const parts = encryptJson({ a: "value" }).split(":");
    const bytes = Buffer.from(parts[3], "base64");
    bytes[0] ^= 1;
    parts[3] = bytes.toString("base64");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });
  it("cannot be read with a different key", () => {
    const blob = encryptJson({ a: 1 });
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptJson(blob)).toThrow();
  });
  it("refuses a bad key", () => {
    process.env.ENCRYPTION_KEY = "short";
    expect(() => encryptJson({})).toThrow(/32 bytes/);
  });
});

describe("passwords", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("rejects when there is no stored hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });
  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("session tokens", () => {
  it("verifies a fresh token", () => {
    expect(verifySession(signSession({ uid: "u1" }, 60))).toEqual({ uid: "u1" });
  });
  it("rejects an expired token", () => {
    const t = signSession({ uid: "u1" }, 60, Date.now() - 120_000);
    expect(verifySession(t)).toBeNull();
  });
  it("rejects a tampered payload", () => {
    const [body, sig] = signSession({ uid: "u1" }, 60).split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: 9999999999 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`)).toBeNull();
    expect(body).toBeTruthy();
  });
  it("rejects garbage and empty input", () => {
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("nope")).toBeNull();
    expect(verifySession("a.b")).toBeNull();
  });
});
