"use client";

import type { AnswerValue } from "@/lib/funnel/engine";
import type { Question } from "@/lib/funnel/schema";
import { Media } from "./Media";
import { PhoneInput } from "./PhoneInput";

type Props = {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  /** Called with the value to submit when an option should advance immediately. */
  onSubmit: (v: AnswerValue) => void;
  labelId: string;
  invalid: boolean;
  /** Builder preview: don't grab keyboard focus. */
  noAutoFocus?: boolean;
};

/** Question types that move on as soon as an option is picked (no Continue button). */
export const autoAdvances = (q: Question) =>
  (q.type === "single_choice" && q.autoAdvance) || q.type === "yes_no" || q.type === "rating";

const field =
  "w-full rounded-[var(--radius)] border-2 border-black/15 bg-white/70 px-4 py-3.5 text-lg outline-none transition focus:border-[var(--primary)] aria-[invalid=true]:border-red-500";
const choice =
  "flex w-full items-center gap-3 rounded-[var(--radius)] border-2 px-4 py-3.5 text-left text-lg transition hover:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

export function QuestionInput({ q, value, onChange, onSubmit, labelId, invalid, noAutoFocus = false }: Props) {
  const af = !noAutoFocus;
  const common = { "aria-labelledby": labelId, "aria-invalid": invalid, className: field } as const;
  const str = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

  switch (q.type) {
    case "short_text":
      return <input {...common} autoFocus={af} type="text" autoComplete="off" value={str} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "long_text":
      return <textarea {...common} autoFocus={af} rows={5} value={str} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "email":
      return <input {...common} autoFocus={af} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={str} placeholder="name@example.com" onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return (
        <PhoneInput
          initialValue={str}
          onChange={onChange}
          defaultCountry={q.defaultCountry}
          preferredCountries={q.preferredCountries}
          allowedCountries={q.allowedCountries}
          labelId={labelId}
          invalid={invalid}
          autoFocus={af}
        />
      );
    case "number":
      return (
        <div className="flex items-center gap-2">
          {q.prefix && <span className="text-lg opacity-70">{q.prefix}</span>}
          <input {...common} autoFocus={af} type="number" inputMode="decimal" value={str} min={q.min} max={q.max} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
          {q.suffix && <span className="text-lg opacity-70">{q.suffix}</span>}
        </div>
      );
    case "date":
      return <input {...common} autoFocus={af} type="date" value={str} min={q.min} max={q.max} onChange={(e) => onChange(e.target.value)} />;
    case "dropdown":
      return (
        <select {...common} autoFocus={af} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "single_choice":
      return (
        <div role="radiogroup" aria-labelledby={labelId} className={q.layout === "cards" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
          {q.options.map((o) => {
            const selected = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => (q.autoAdvance ? onSubmit(o.value) : onChange(o.value))}
                className={`${choice} ${q.layout === "cards" ? "flex-col justify-center py-6 text-center" : ""} ${selected ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-black/15 bg-white/70"}`}
              >
                <Media media={o.media} className={q.layout === "cards" ? "h-8 w-8" : "h-6 w-6 shrink-0"} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      );
    case "multiple_choice": {
      const current = Array.isArray(value) ? value : [];
      return (
        <div role="group" aria-labelledby={labelId} className="grid gap-3">
          {q.options.map((o) => {
            const on = current.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange(on ? current.filter((v) => v !== o.value) : [...current, o.value])}
                className={`${choice} ${on ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-black/15 bg-white/70"}`}
              >
                <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded border-2 ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-black/30"}`}>{on ? "✓" : ""}</span>
                <Media media={o.media} className="h-6 w-6 shrink-0" />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      );
    }
    case "yes_no":
      return (
        <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-3">
          {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map(({ v, l }) => (
            <button key={l} type="button" role="radio" aria-checked={value === v} onClick={() => onSubmit(v)}
              className={`${choice} justify-center ${value === v ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-black/15 bg-white/70"}`}>{l}</button>
          ))}
        </div>
      );
    case "rating":
      return (
        <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-3">
          {Array.from({ length: q.scale }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onSubmit(n)}
              className={`${choice} h-14 w-14 justify-center px-0 ${value === n ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-black/15 bg-white/70"}`}>{n}</button>
          ))}
        </div>
      );
    case "address": {
      const a = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
      const set = (k: string, v: string) => onChange({ ...a, [k]: v });
      return (
        <div className="grid gap-3" role="group" aria-labelledby={labelId}>
          <input className={field} autoFocus={af} placeholder="Address line 1" autoComplete="address-line1" value={a.line1 ?? ""} onChange={(e) => set("line1", e.target.value)} aria-invalid={invalid && !a.line1} />
          <input className={field} placeholder="Address line 2 (optional)" autoComplete="address-line2" value={a.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className={field} placeholder="Town / city" autoComplete="address-level2" value={a.town ?? ""} onChange={(e) => set("town", e.target.value)} />
            <input className={field} placeholder="Postcode" autoComplete="postal-code" value={a.postcode ?? ""} onChange={(e) => set("postcode", e.target.value.toUpperCase())} aria-invalid={invalid && !a.postcode} />
          </div>
        </div>
      );
    }
    case "consent":
      return (
        <label className={`${choice} cursor-pointer ${value === true ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-black/15 bg-white/70"}`}>
          <input type="checkbox" className="h-6 w-6 accent-[var(--primary)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-describedby={labelId} />
          <span className="text-base">
            {q.linkUrl && q.linkText ? (
              <a href={q.linkUrl} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{q.linkText}</a>
            ) : (
              "I agree"
            )}
          </span>
        </label>
      );
    case "statement":
    case "hidden":
      return null;
  }
}
