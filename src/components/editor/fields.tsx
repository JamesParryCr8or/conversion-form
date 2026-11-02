"use client";

import { useId, useState } from "react";

export const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 aria-[invalid=true]:border-red-500";
export const smallBtn =
  "inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function TextField(props: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; hint?: React.ReactNode; multiline?: boolean; type?: string; invalid?: boolean }) {
  const id = useId();
  const common = {
    id,
    value: props.value ?? "",
    placeholder: props.placeholder,
    "aria-invalid": props.invalid,
    className: inputCls,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.onChange(e.target.value),
  };
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      {props.multiline ? <textarea rows={2} {...common} /> : <input type={props.type ?? "text"} {...common} />}
    </Field>
  );
}

/** Number input that stores undefined when cleared. */
export function NumberField(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; hint?: string; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      <input
        id={id}
        type="number"
        className={inputCls}
        value={props.value ?? ""}
        min={props.min}
        max={props.max}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </Field>
  );
}

export function SelectField<T extends string>(props: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hint?: string }) {
  const id = useId();
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id}>
      <select id={id} className={inputCls} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-indigo-600" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span>
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-gray-300" />
        <input id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!valid} />
      </div>
    </Field>
  );
}

/** Comma-separated list of 2-letter country codes, e.g. "gb, ie". */
export function CountryListField({ label, value, onChange, hint }: { label: string; value: string[] | undefined; onChange: (v: string[] | undefined) => void; hint?: string }) {
  const [text, setText] = useState((value ?? []).join(", "));
  const id = useId();
  const parsed = text.split(/[\s,]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const invalid = parsed.some((c) => !/^[a-z]{2}$/.test(c));
  return (
    <Field label={label} hint={invalid ? "Use 2-letter country codes, e.g. gb, ie, us" : hint} htmlFor={id}>
      <input
        id={id}
        className={inputCls}
        value={text}
        aria-invalid={invalid}
        placeholder="gb, ie"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => !invalid && onChange(parsed.length ? parsed : undefined)}
      />
    </Field>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-t border-gray-200 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-gray-800">
        {title}
        <span className="text-gray-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
