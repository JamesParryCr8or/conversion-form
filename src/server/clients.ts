import { z } from "zod";

/**
 * Per-client integration config.
 *  - SETTINGS are ids that are visible in page source anyway (pixel id, GA4 id...). Stored as plain JSON.
 *  - SECRETS are credentials. Stored AES-256-GCM encrypted and never sent back to the browser.
 */

const optional = (re: RegExp, message: string) =>
  z.string().trim().regex(re, message).or(z.literal(""));

export const settingsSchema = z.object({
  ghlLocationId: optional(/^[A-Za-z0-9]{8,40}$/, "GHL Location ID should be letters and numbers only (8 to 40 characters)"),
  metaPixelId: optional(/^\d{8,20}$/, "Meta Pixel ID is a number (8 to 20 digits)"),
  metaTestEventCode: optional(/^TEST[A-Za-z0-9]{2,20}$/, "Test event code looks like TEST12345"),
  ga4MeasurementId: optional(/^G-[A-Za-z0-9]{6,14}$/, "GA4 Measurement ID looks like G-XXXXXXXXXX"),
  googleAdsConversionId: optional(/^AW-\d{6,14}$/, "Google Ads ID looks like AW-123456789"),
  googleAdsConversionLabel: optional(/^[A-Za-z0-9_-]{6,40}$/, "Conversion label should be letters, numbers, - or _"),
  gtmId: optional(/^GTM-[A-Za-z0-9]{4,12}$/, "GTM ID looks like GTM-XXXXXXX"),
});
export type ClientSettings = z.infer<typeof settingsSchema>;
export const SETTING_KEYS = Object.keys(settingsSchema.shape) as (keyof ClientSettings)[];

const token = (min: number, label: string) =>
  z.string().trim().min(min, `${label} looks too short`).regex(/^\S+$/, `${label} must not contain spaces`);

export const secretsSchema = z.object({
  ghlPit: token(20, "GHL private access token"),
  metaCapiToken: token(20, "Meta access token"),
  ga4ApiSecret: token(8, "GA4 API secret"),
  webhookUrl: z.string().trim().url("Webhook must be a full https:// URL").refine((u) => u.startsWith("https://"), "Webhook must use https://"),
});
export type ClientSecrets = Partial<z.infer<typeof secretsSchema>>;
export const SECRET_KEYS = Object.keys(secretsSchema.shape) as (keyof z.infer<typeof secretsSchema>)[];

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "client";

/**
 * Work out what to store when saving the form.
 * A blank secret keeps the existing value; "remove" clears it; anything else replaces it.
 */
export function mergeSecrets(
  existing: ClientSecrets,
  submitted: Partial<Record<keyof ClientSecrets, string>>,
  remove: Set<string>,
): { ok: true; secrets: ClientSecrets; changed: string[] } | { ok: false; errors: Record<string, string> } {
  const next: ClientSecrets = { ...existing };
  const errors: Record<string, string> = {};
  const changed: string[] = [];

  for (const key of SECRET_KEYS) {
    if (remove.has(key)) {
      if (next[key] !== undefined) changed.push(key);
      delete next[key];
      continue;
    }
    const value = submitted[key]?.trim();
    if (!value) continue; // blank = keep
    const parsed = secretsSchema.shape[key].safeParse(value);
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0].message;
      continue;
    }
    next[key] = parsed.data;
    changed.push(key);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, secrets: next, changed };
}
