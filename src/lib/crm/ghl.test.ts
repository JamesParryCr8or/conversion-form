import { describe, expect, it } from "vitest";
import { parseFunnel } from "../funnel/io";
import starter from "../funnel/templates/lead-gen.json";
import { buildContact, buildNote, namesFrom, type CrmSubmission } from "./ghl";

const parsed = parseFunnel(starter);
if (!parsed.ok) throw new Error("starter template must parse");
const funnel = parsed.funnel;

const sub: CrmSubmission = {
  email: "jane@example.com",
  phoneE164: "+447712345678",
  addressLine1: "1 High Street",
  addressLine2: null,
  town: "Leeds",
  county: "West Yorkshire",
  postcode: "LS1 1AA",
  country: "GB",
};

describe("namesFrom", () => {
  it("splits full_name on the first space", () => {
    expect(namesFrom(funnel, { full_name: "Jane Mary Smith" })).toEqual({ firstName: "Jane", lastName: "Mary Smith" });
  });

  it("uses first and last name keys when present", () => {
    const f = parseFunnel({
      ...starter,
      logic: [],
      questions: [
        { key: "first_name", type: "short_text", label: "First name" },
        { key: "last_name", type: "short_text", label: "Last name" },
      ],
    });
    if (!f.ok) throw new Error("bad fixture");
    expect(namesFrom(f.funnel, { first_name: " Jane ", last_name: "Smith" })).toEqual({ firstName: "Jane", lastName: "Smith" });
  });

  it("returns nothing when there is no name question", () => {
    expect(namesFrom(funnel, {})).toEqual({ firstName: undefined, lastName: undefined });
  });
});

describe("buildContact", () => {
  it("maps contact, name and address fields with the form tag", () => {
    const c = buildContact(funnel, sub, { full_name: "Jane Smith" }, "acme-quote");
    expect(c).toEqual({
      email: "jane@example.com",
      phone: "+447712345678",
      firstName: "Jane",
      lastName: "Smith",
      address1: "1 High Street",
      city: "Leeds",
      state: "West Yorkshire",
      postalCode: "LS1 1AA",
      country: "GB",
      source: "CR8OR Forms",
      tags: ["cr8or-form", "acme-quote"],
    });
  });

  it("leaves out empty fields so GHL keeps what it already has", () => {
    const c = buildContact(funnel, { ...sub, phoneE164: null, town: null, addressLine1: null, addressLine2: "Flat 2" }, {}, "x");
    expect(c).not.toHaveProperty("phone");
    expect(c).not.toHaveProperty("city");
    expect(c.address1).toBe("Flat 2");
    expect(c).not.toHaveProperty("firstName");
  });
});

describe("buildNote", () => {
  it("lists every answer in form order using option labels", () => {
    const note = buildNote(
      funnel,
      { service: "website", budget: "1k_5k", full_name: "Jane Smith", email: "jane@example.com", consent: true },
      "Lead Gen Starter",
      { utm_source: "meta", fbclid: "abc" },
    );
    expect(note).toBe(
      [
        "Form: Lead Gen Starter",
        "What do you need help with?: A new website",
        "What's your monthly budget?: £1,000 – £5,000",
        "What's your name?: Jane Smith",
        "What's your email address?: jane@example.com",
        "I agree to be contacted about my enquiry: Agreed",
        "Tracking: utm_source=meta, fbclid=abc",
      ].join("\n"),
    );
  });

  it("skips questions with no answer", () => {
    const note = buildNote(funnel, { email: "a@b.co" }, "Form", {});
    expect(note).toBe("Form: Form\nWhat's your email address?: a@b.co");
  });
});
