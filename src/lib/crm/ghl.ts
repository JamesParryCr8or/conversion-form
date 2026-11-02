import { formatAnswer } from "../funnel/format";
import type { Funnel } from "../funnel/schema";

/** Pure mapping from a submission to what GoHighLevel should receive. No I/O, so it is unit tested. */

const FIRST_NAME_KEYS = ["first_name", "firstname", "given_name", "fname"];
const LAST_NAME_KEYS = ["last_name", "lastname", "surname", "family_name", "lname"];
const FULL_NAME_KEYS = ["full_name", "fullname", "name", "your_name"];

type Contact = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type CrmSubmission = {
  email: string | null;
  phoneE164: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
};

/** Pull a name out of short_text answers keyed like first_name / last_name, or split full_name. */
export function namesFrom(funnel: Funnel, answers: Record<string, unknown>) {
  const pick = (keys: string[]) => {
    for (const key of keys) {
      const q = funnel.questions.find((x) => x.key === key && x.type === "short_text");
      const v = q ? answers[key] : undefined;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };
  let firstName = pick(FIRST_NAME_KEYS);
  let lastName = pick(LAST_NAME_KEYS);
  if (!firstName && !lastName) {
    const full = pick(FULL_NAME_KEYS);
    if (full) {
      const [first, ...rest] = full.split(/\s+/);
      firstName = first;
      lastName = rest.join(" ") || undefined;
    }
  }
  return { firstName, lastName };
}

export type GhlContact = Contact & { source: string; tags: string[] };

export function buildContact(funnel: Funnel, sub: CrmSubmission, answers: Record<string, unknown>, formSlug: string): GhlContact {
  const contact: Contact = {
    email: sub.email ?? undefined,
    phone: sub.phoneE164 ?? undefined,
    ...namesFrom(funnel, answers),
    address1: [sub.addressLine1, sub.addressLine2].filter(Boolean).join(", ") || undefined,
    city: sub.town ?? undefined,
    state: sub.county ?? undefined,
    postalCode: sub.postcode ?? undefined,
    country: sub.country ?? undefined,
  };
  // Drop empty fields so GHL keeps whatever it already has.
  const compact = Object.fromEntries(Object.entries(contact).filter(([, v]) => v !== undefined && v !== "")) as Contact;
  return { ...compact, source: "CR8OR Forms", tags: ["cr8or-form", formSlug] };
}

/** One readable note listing every answer in funnel order, plus tracking params. */
export function buildNote(funnel: Funnel, answers: Record<string, unknown>, formName: string, params: Record<string, string>) {
  const lines = [`Form: ${formName}`];
  for (const q of funnel.questions) {
    const text = formatAnswer(q, answers[q.key]);
    if (text) lines.push(`${q.label}: ${text}`);
  }
  const tracking = Object.entries(params ?? {});
  if (tracking.length) lines.push(`Tracking: ${tracking.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  return lines.join("\n");
}
