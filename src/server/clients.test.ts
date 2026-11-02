import { describe, expect, it } from "vitest";
import { mergeSecrets, secretsSchema, settingsSchema, slugify } from "./clients";

describe("settings validation", () => {
  const good = { ghlLocationId: "AbC123xyz890", metaPixelId: "1234567890123", metaTestEventCode: "TEST12345", ga4MeasurementId: "G-ABC123DEF4", googleAdsConversionId: "AW-123456789", googleAdsConversionLabel: "AbCd_1234-x", gtmId: "GTM-ABCD123" };
  it("accepts well-formed ids", () => expect(settingsSchema.safeParse(good).success).toBe(true));
  it("accepts blanks (nothing configured)", () =>
    expect(settingsSchema.safeParse(Object.fromEntries(Object.keys(good).map((k) => [k, ""]))).success).toBe(true));
  it.each([
    ["ghlLocationId", "has spaces in it"],
    ["metaPixelId", "abc123"],
    ["ga4MeasurementId", "UA-123"],
    ["googleAdsConversionId", "123456"],
    ["gtmId", "GTM"],
  ])("rejects bad %s", (key, value) => expect(settingsSchema.safeParse({ ...good, [key]: value }).success).toBe(false));
  it("trims whitespace", () => expect(settingsSchema.parse({ ...good, metaPixelId: "  1234567890  " }).metaPixelId).toBe("1234567890"));
});

describe("secret merging", () => {
  const existing = { ghlPit: "pit-existing-token-value-123", metaCapiToken: "EAAexistingtokenvalue12345" };

  it("keeps existing secrets when the fields are left blank", () => {
    const r = mergeSecrets(existing, { ghlPit: "", metaCapiToken: "   " }, new Set());
    expect(r.ok && r.secrets).toEqual(existing);
    expect(r.ok && r.changed).toEqual([]);
  });
  it("replaces a secret when a new value is typed", () => {
    const r = mergeSecrets(existing, { ghlPit: "pit-brand-new-token-value-456" }, new Set());
    expect(r.ok && r.secrets.ghlPit).toBe("pit-brand-new-token-value-456");
    expect(r.ok && r.secrets.metaCapiToken).toBe(existing.metaCapiToken);
    expect(r.ok && r.changed).toEqual(["ghlPit"]);
  });
  it("removes a secret when asked", () => {
    const r = mergeSecrets(existing, {}, new Set(["metaCapiToken"]));
    expect(r.ok && "metaCapiToken" in r.secrets).toBe(false);
    expect(r.ok && r.secrets.ghlPit).toBe(existing.ghlPit);
  });
  it("rejects invalid input without touching anything", () => {
    const r = mergeSecrets(existing, { ghlPit: "short", webhookUrl: "http://insecure.example" }, new Set());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["ghlPit", "webhookUrl"]);
  });
  it("rejects tokens containing spaces", () => {
    expect(secretsSchema.shape.ghlPit.safeParse("pit-has a space in the middle-xx").success).toBe(false);
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Acme Plumbing & Heating Ltd.")).toBe("acme-plumbing-heating-ltd");
    expect(slugify("  Café  Déjà-vu ")).toBe("cafe-deja-vu");
    expect(slugify("!!!")).toBe("client");
  });
});
