"use client";

import { ArrowDown, ArrowUp, Copy, Trash2, X } from "lucide-react";
import { useState } from "react";
import { BLOCKS, KEY_RE, keyFromText } from "@/lib/funnel/editing";
import type { Question } from "@/lib/funnel/schema";
import type { MediaValue } from "@/components/form/Media";
import { CountryListField, Field, NumberField, Section, SelectField, TextField, Toggle, inputCls, smallBtn } from "./fields";
import { MediaPicker } from "./MediaPicker";

type Option = { value: string; label: string; media?: MediaValue };

type Props = {
  q: Question;
  formId: string;
  issues: string[];
  onPatch: (patch: Partial<Question>) => void;
  /** Replace the options; `renamed` is set when a stored value changed, so logic can follow. */
  onOptions: (options: Option[], renamed?: { from: string; to: string }) => void;
  /** Returns an error message, or null when renamed. */
  onRenameKey: (to: string) => string | null;
  /** False for the first question (nothing above it to stack onto) and for hidden fields. */
  canStack: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
};

const typeName = (q: Question) => {
  if (q.type === "single_choice" && q.layout === "cards") return "Picture choice";
  if (q.type === "number" && q.prefix === "£") return "Currency";
  return BLOCKS.find((b) => b.type === q.type)?.label ?? q.type;
};

export function QuestionProperties({ q, formId, issues, onPatch, onOptions, onRenameKey, canStack, onDuplicate, onDelete }: Props) {
  const set = (patch: Record<string, unknown>) => onPatch(patch as Partial<Question>);
  const hasRequired = q.type !== "statement" && q.type !== "hidden";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between pb-2">
        <p className="text-sm font-semibold text-gray-900">{typeName(q)}</p>
        <div className="flex gap-1">
          <button type="button" className={smallBtn} onClick={onDuplicate} title="Duplicate"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
          <button type="button" className={`${smallBtn} text-red-700`} onClick={onDelete} title="Delete"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul role="alert" className="mb-2 space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {issues.map((m, i) => <li key={i}>• {m}</li>)}
        </ul>
      )}

      <div className="space-y-3 pb-3">
        <TextField label={q.type === "hidden" ? "Name (only you see this)" : q.type === "consent" ? "Consent text" : "Question"} value={q.label} onChange={(label) => set({ label })} multiline invalid={!q.label.trim()} />
        {q.type !== "hidden" && <TextField label="Description (optional)" value={q.description} onChange={(d) => set({ description: d || undefined })} multiline />}
        {hasRequired && <Toggle label="Required" checked={q.required} onChange={(required) => set({ required })} />}
        {canStack && (
          <Toggle
            label="Same screen as the question above"
            checked={q.sameScreen}
            onChange={(sameScreen) => set({ sameScreen })}
            hint="Shows them together on one page with one Continue button. Logic is checked after the last question on the page."
          />
        )}
      </div>

      {q.type !== "hidden" && (
        <Section title="Image or icon" defaultOpen={Boolean(q.media)}>
          <MediaPicker formId={formId} value={q.media} onChange={(media) => set({ media })} label="Shown above the question" />
        </Section>
      )}

      <TypeSettings q={q} formId={formId} set={set} onOptions={onOptions} />

      <Section title="Advanced" defaultOpen={false}>
        <KeyEditor current={q.key} onRename={onRenameKey} />
      </Section>
    </div>
  );
}

function TypeSettings({ q, formId, set, onOptions }: { q: Question; formId: string; set: (p: Record<string, unknown>) => void; onOptions: Props["onOptions"] }) {
  switch (q.type) {
    case "short_text":
    case "long_text":
      return (
        <Section title="Settings">
          <TextField label="Placeholder" value={q.placeholder} onChange={(v) => set({ placeholder: v || undefined })} />
          <NumberField label="Maximum length" value={q.maxLength} min={1} onChange={(maxLength) => set({ maxLength })} placeholder={q.type === "short_text" ? "500" : "5000"} />
        </Section>
      );
    case "email":
      return (
        <Section title="Verification">
          <Toggle label="Check the address can receive email" checked={q.deliverabilityCheck} onChange={(v) => set({ deliverabilityCheck: v })} hint="Uses the client's GHL email check, once per address (charged by GHL). Runs once the email checks are built." />
          <Toggle label="Send a 6-digit code to confirm the email" checked={q.codeVerification} onChange={(v) => set({ codeVerification: v })} hint="Sent through the client's GHL. Runs once email codes are built." />
        </Section>
      );
    case "phone":
      return (
        <Section title="Phone settings">
          <TextField label="Default country" value={q.defaultCountry} onChange={(v) => set({ defaultCountry: v.toLowerCase().slice(0, 2) })} hint="2-letter code, e.g. gb" />
          <CountryListField label="Countries at the top of the list" value={q.preferredCountries} onChange={(v) => set({ preferredCountries: v ?? [] })} />
          <CountryListField label="Only allow these countries" value={q.allowedCountries} onChange={(v) => set({ allowedCountries: v })} hint="Leave empty to allow any country. Recommended for SMS codes (stops SMS fraud)." />
          <SelectField
            label="Text message code"
            value={q.verification}
            onChange={(verification) => set({ verification })}
            options={[{ value: "off", label: "Off" }, { value: "optional", label: "Optional" }, { value: "required", label: "Required" }]}
            hint="Twilio 6-digit code. Runs once phone verification is built."
          />
        </Section>
      );
    case "single_choice":
      return (
        <Section title="Choices">
          <OptionsEditor q={q} formId={formId} onOptions={onOptions} />
          <SelectField label="Layout" value={q.layout} onChange={(layout) => set({ layout })} options={[{ value: "buttons", label: "List of buttons" }, { value: "cards", label: "Cards (good with images or icons)" }]} />
          <Toggle label="Move on as soon as they pick" checked={q.autoAdvance} onChange={(autoAdvance) => set({ autoAdvance })} />
        </Section>
      );
    case "multiple_choice":
      return (
        <Section title="Choices">
          <OptionsEditor q={q} formId={formId} onOptions={onOptions} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Pick at least" value={q.min} min={0} onChange={(min) => set({ min })} />
            <NumberField label="Pick at most" value={q.max} min={1} onChange={(max) => set({ max })} />
          </div>
        </Section>
      );
    case "dropdown":
      return (
        <Section title="Choices">
          <OptionsEditor q={q} formId={formId} onOptions={onOptions} />
        </Section>
      );
    case "number":
      return (
        <Section title="Settings">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Minimum" value={q.min} onChange={(min) => set({ min })} />
            <NumberField label="Maximum" value={q.max} onChange={(max) => set({ max })} />
            <TextField label="Before (e.g. £)" value={q.prefix} onChange={(v) => set({ prefix: v || undefined })} />
            <TextField label="After (e.g. sq ft)" value={q.suffix} onChange={(v) => set({ suffix: v || undefined })} />
          </div>
        </Section>
      );
    case "date":
      return (
        <Section title="Settings">
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Earliest" type="date" value={q.min} onChange={(v) => set({ min: v || undefined })} />
            <TextField label="Latest" type="date" value={q.max} onChange={(v) => set({ max: v || undefined })} />
          </div>
        </Section>
      );
    case "rating":
      return (
        <Section title="Settings">
          <NumberField label="Scale (2 to 10)" value={q.scale} min={2} max={10} onChange={(v) => set({ scale: Math.max(2, Math.min(10, v ?? 5)) })} />
        </Section>
      );
    case "address":
      return (
        <Section title="Settings">
          <SelectField label="Countries" value={q.countries} onChange={(countries) => set({ countries })} options={[{ value: "uk", label: "UK only" }, { value: "uk_and_international", label: "UK and international" }]} hint="Postcode lookup (Royal Mail) and Google lookup are coming; for now visitors type their address." />
        </Section>
      );
    case "consent":
      return (
        <Section title="Link">
          <TextField label="Link text" value={q.linkText} onChange={(v) => set({ linkText: v || undefined })} placeholder="Privacy policy" />
          <TextField label="Link URL" value={q.linkUrl} onChange={(v) => set({ linkUrl: v || undefined })} placeholder="https://…" />
        </Section>
      );
    case "statement":
      return (
        <Section title="Settings">
          <TextField label="Button text" value={q.buttonText} onChange={(v) => set({ buttonText: v })} />
        </Section>
      );
    case "hidden":
      return (
        <Section title="Settings">
          <TextField label="URL parameter" value={q.param} onChange={(v) => set({ param: v.trim() })} hint="e.g. utm_campaign. The value is taken from the page link and saved with the submission." />
        </Section>
      );
    default:
      return null;
  }
}

/* ---------------- Choices ---------------- */

const AUTO_VALUE = /^option_\d+$/;

function OptionsEditor({ q, formId, onOptions }: { q: Question & { options: Option[] }; formId: string; onOptions: Props["onOptions"] }) {
  const [openMedia, setOpenMedia] = useState<number | null>(null);
  const options = q.options;

  const uniqueValue = (base: string, exceptIndex: number) => {
    const taken = new Set(options.filter((_, i) => i !== exceptIndex).map((o) => o.value));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
  };

  const setLabel = (i: number, label: string) => {
    const old = options[i];
    const next = [...options];
    // Keep the stored value in step with the label while it is still the automatic one.
    const auto = AUTO_VALUE.test(old.value) || old.value === keyFromText(old.label);
    const value = auto && label.trim() ? uniqueValue(keyFromText(label), i) : old.value;
    next[i] = { ...old, label, value };
    onOptions(next, value !== old.value ? { from: old.value, to: value } : undefined);
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onOptions(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Options</p>
      {options.map((o, i) => (
        <div key={i} className="space-y-1 rounded-md border border-gray-200 p-2">
          <div className="flex items-center gap-1">
            <input aria-label={`Option ${i + 1}`} className={inputCls} value={o.label} onChange={(e) => setLabel(i, e.target.value)} aria-invalid={!o.label.trim()} />
            <button type="button" aria-label="Move up" className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" aria-label="Move down" className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30" disabled={i === options.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
            <button type="button" aria-label="Remove option" className="p-1 text-gray-500 hover:text-red-700" onClick={() => onOptions(options.filter((_, k) => k !== i))}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Saved as <code className="rounded bg-gray-100 px-1">{o.value}</code></span>
            <button type="button" className="text-indigo-600 hover:underline" onClick={() => setOpenMedia(openMedia === i ? null : i)}>
              {o.media ? "Change image/icon" : "Add image/icon"}
            </button>
          </div>
          {openMedia === i && (
            <MediaPicker formId={formId} value={o.media} label="Option image or icon" onChange={(media) => onOptions(options.map((x, k) => (k === i ? { ...x, media } : x)))} />
          )}
        </div>
      ))}
      {options.length < 2 && <p className="text-xs text-red-600">Add at least 2 options.</p>}
      <button
        type="button"
        className={smallBtn}
        onClick={() => {
          const n = options.length + 1;
          onOptions([...options, { value: uniqueValue(`option_${n}`, -1), label: `Option ${n}` }]);
        }}
      >
        + Add option
      </button>
    </div>
  );
}

/* ---------------- Key ---------------- */

function KeyEditor({ current, onRename }: { current: string; onRename: Props["onRenameKey"] }) {
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const valid = KEY_RE.test(draft);
  return (
    <Field label="Question ID" hint="Used in links (?q=…), logic and the GHL field mapping. Changing it updates your logic; answers already collected keep the old ID.">
      <div className="flex gap-2">
        <input className={`${inputCls} font-mono`} value={draft} aria-invalid={!valid} onChange={(e) => { setDraft(e.target.value); setError(null); }} />
        <button
          type="button"
          className={smallBtn}
          disabled={draft === current || !valid}
          onClick={() => setError(onRename(draft))}
        >
          Rename
        </button>
      </div>
      {!valid && <p className="text-xs text-red-600">Lowercase letters, numbers and _ only, starting with a letter.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Field>
  );
}
