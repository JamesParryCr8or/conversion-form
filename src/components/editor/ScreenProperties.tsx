"use client";

import { Trash2 } from "lucide-react";
import type { EndScreen, Funnel } from "@/lib/funnel/schema";
import { NumberField, Section, TextField, Toggle, smallBtn } from "./fields";
import { MediaPicker } from "./MediaPicker";

type Welcome = NonNullable<Funnel["welcome"]>;

export function WelcomeProperties({ welcome, formId, onChange }: { welcome: Funnel["welcome"]; formId: string; onChange: (w: Funnel["welcome"]) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">Welcome screen</p>
      <Toggle
        label="Show a welcome screen"
        checked={Boolean(welcome)}
        onChange={(on) => onChange(on ? { title: "Get your free quote in 60 seconds", buttonText: "Start" } : undefined)}
        hint="The first thing visitors see, before the questions."
      />
      {welcome && (
        <>
          <TextField label="Heading" value={welcome.title} onChange={(title) => onChange({ ...welcome, title })} multiline invalid={!welcome.title.trim()} />
          <TextField label="Text (optional)" value={welcome.body} onChange={(body) => onChange({ ...welcome, body: body || undefined })} multiline />
          <TextField label="Button text" value={welcome.buttonText} onChange={(buttonText) => onChange({ ...welcome, buttonText })} />
          <Section title="Image or icon" defaultOpen={Boolean(welcome.media)}>
            <MediaPicker formId={formId} value={welcome.media} onChange={(media) => onChange({ ...welcome, media } as Welcome)} />
          </Section>
        </>
      )}
    </div>
  );
}

export function EndProperties(props: {
  end: EndScreen;
  formId: string;
  issues: string[];
  canDelete: boolean;
  onChange: (patch: Partial<EndScreen>) => void;
  onDelete: () => void;
}) {
  const { end, formId, issues, canDelete, onChange, onDelete } = props;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Ending</p>
        <button type="button" className={`${smallBtn} text-red-700`} disabled={!canDelete} onClick={onDelete} title={canDelete ? "Delete" : "A form needs at least one ending"}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
      {issues.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {issues.map((m, i) => <li key={i}>• {m}</li>)}
        </ul>
      )}
      <TextField label="Heading" value={end.title} onChange={(title) => onChange({ title })} multiline invalid={!end.title.trim()} />
      <TextField label="Text (optional)" value={end.body} onChange={(body) => onChange({ body: body || undefined })} multiline />
      <Toggle label="Default ending" checked={end.isDefault} onChange={(v) => v && onChange({ isDefault: true })} hint="Shown when no logic rule sends people to a different ending." />
      <Section title="Redirect" defaultOpen={Boolean(end.redirectUrl)}>
        <TextField label="Send them to a page (optional)" value={end.redirectUrl} onChange={(v) => onChange({ redirectUrl: v || undefined })} placeholder="https://…" hint="E.g. a booking page. When embedded, the whole page goes there." />
        <NumberField label="Wait (seconds)" value={end.redirectDelaySeconds} min={0} max={60} onChange={(v) => onChange({ redirectDelaySeconds: v ?? 0 })} />
      </Section>
      <Section title="Image or icon" defaultOpen={Boolean(end.media)}>
        <MediaPicker formId={formId} value={end.media} onChange={(media) => onChange({ media })} />
      </Section>
      <p className="text-xs text-gray-500">ID: <code className="rounded bg-gray-100 px-1">{end.key}</code></p>
    </div>
  );
}
