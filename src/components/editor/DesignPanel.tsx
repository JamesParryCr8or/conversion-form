"use client";

import type { Funnel } from "@/lib/funnel/schema";
import { ColorField, Section, SelectField, TextField, Toggle } from "./fields";
import { MediaPicker } from "./MediaPicker";

type Update = (fn: (f: Funnel) => Funnel) => void;
type Theme = Funnel["form"]["theme"];
type Settings = Funnel["form"]["settings"];

const FONTS = [
  { value: "Inter", label: "Modern sans (Inter / system)" },
  { value: "system-ui", label: "System default" },
  { value: "Georgia", label: "Classic serif (Georgia)" },
  { value: "Verdana", label: "Wide sans (Verdana)" },
  { value: "Trebuchet MS", label: "Friendly sans (Trebuchet)" },
];

export function DesignPanel({ funnel, formId, update }: { funnel: Funnel; formId: string; update: Update }) {
  const theme = funnel.form.theme;
  const settings = funnel.form.settings;
  const setTheme = (p: Partial<Theme>) => update((f) => ({ ...f, form: { ...f.form, theme: { ...f.form.theme, ...p } } }));
  const setSettings = (p: Partial<Settings>) => update((f) => ({ ...f, form: { ...f.form, settings: { ...f.form.settings, ...p } } }));

  return (
    <div className="space-y-1 p-4">
      <div className="space-y-3 pb-3">
        <TextField label="Form name" value={funnel.form.name} onChange={(name) => update((f) => ({ ...f, form: { ...f.form, name } }))} invalid={!funnel.form.name.trim()} hint="For you; visitors don't see it." />
      </div>

      <Section title="Colours">
        <ColorField label="Buttons and highlights" value={theme.primaryColor} onChange={(primaryColor) => setTheme({ primaryColor })} />
        <ColorField label="Background" value={theme.backgroundColor} onChange={(backgroundColor) => setTheme({ backgroundColor })} />
        <ColorField label="Text" value={theme.textColor} onChange={(textColor) => setTheme({ textColor })} />
      </Section>

      <Section title="Style">
        <SelectField label="Font" value={theme.fontFamily} onChange={(fontFamily) => setTheme({ fontFamily })} options={FONTS.some((f) => f.value === theme.fontFamily) ? FONTS : [...FONTS, { value: theme.fontFamily, label: theme.fontFamily }]} />
        <SelectField label="Button shape" value={theme.buttonStyle} onChange={(buttonStyle) => setTheme({ buttonStyle })} options={[{ value: "rounded", label: "Rounded" }, { value: "pill", label: "Pill" }, { value: "square", label: "Square" }]} />
      </Section>

      <Section title="Logo and background" defaultOpen={Boolean(theme.logoUrl || theme.backgroundImageUrl)}>
        <MediaPicker formId={formId} allowIcon={false} label="Logo" value={theme.logoUrl ? { kind: "image", url: theme.logoUrl } : undefined} onChange={(m) => setTheme({ logoUrl: m?.kind === "image" ? m.url : undefined })} />
        <MediaPicker formId={formId} allowIcon={false} label="Background image" value={theme.backgroundImageUrl ? { kind: "image", url: theme.backgroundImageUrl } : undefined} onChange={(m) => setTheme({ backgroundImageUrl: m?.kind === "image" ? m.url : undefined })} />
      </Section>

      <Section title="Behaviour">
        <Toggle label="Show a progress bar" checked={settings.showProgressBar} onChange={(showProgressBar) => setSettings({ showProgressBar })} />
        <Toggle label="Save answers as they go (partial submissions)" checked={settings.savePartials} onChange={(savePartials) => setSettings({ savePartials })} hint="Keeps leads who drop off halfway." />
        <SelectField
          label="Count it as a lead when"
          value={settings.leadEventOn}
          onChange={(leadEventOn) => setSettings({ leadEventOn })}
          options={[
            { value: "contact_captured", label: "They give an email or phone" },
            { value: "completed", label: "They finish the form" },
            { value: "verified", label: "Their phone or email is verified" },
          ]}
          hint="Used for the Meta and Google 'Lead' event once tracking is connected."
        />
      </Section>
    </div>
  );
}
