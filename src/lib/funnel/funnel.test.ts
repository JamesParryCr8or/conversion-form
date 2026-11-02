import { describe, expect, it } from "vitest";
import { exportFunnel, parseFunnel } from "./io";
import sample from "./templates/lead-gen.json";

describe("funnel schema", () => {
  it("accepts the starter lead-gen template", () => {
    const r = parseFunnel(sample);
    expect(r.ok).toBe(true);
  });

  it("round-trips through export and import", () => {
    const first = parseFunnel(sample);
    if (!first.ok) throw new Error(first.errors.join("\n"));
    const second = parseFunnel(exportFunnel(first.funnel));
    expect(second).toEqual(first);
  });

  it("rejects invalid JSON", () => {
    const r = parseFunnel("{nope");
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate question keys", () => {
    const bad = structuredClone(sample) as any;
    bad.questions[1].key = bad.questions[0].key;
    const r = parseFunnel(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/Duplicate question key/);
  });

  it("rejects logic that points at unknown questions", () => {
    const bad = structuredClone(sample) as any;
    bad.logic = [
      { id: "r1", after: "full_name", conditions: [{ source: { kind: "question", key: "full_name" }, operator: "is_answered" }], action: { type: "jump", to: "nope" } },
    ];
    const r = parseFunnel(bad);
    expect(r.ok).toBe(false);
  });

  it("refuses files that contain secrets", () => {
    const bad = structuredClone(sample) as any;
    bad.form.metaPixelId = "123";
    bad.form.settings.accessToken = "abc";
    bad.form.apiKey = "abc";
    const r = parseFunnel(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/apiKey/);
  });

  it("refuses files from a newer schema version", () => {
    const r = parseFunnel({ ...(sample as object), schemaVersion: 99 });
    expect(r.ok).toBe(false);
  });
});
