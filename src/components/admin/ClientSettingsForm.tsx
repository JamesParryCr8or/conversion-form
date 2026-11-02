"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { saveClientAction, type ActionState } from "@/app/admin/actions";
import { btn, card, errorText, hint, input, label } from "./ui";

type Props = {
  id: string;
  name: string;
  timezone: string;
  settings: Record<string, string | undefined>;
  /** Which secrets are saved. Booleans only: the secret values never reach the browser. */
  secretsSet: Record<string, boolean>;
  secretsUnreadable: boolean;
};

export function ClientSettingsForm({ id, name, timezone, settings, secretsSet, secretsUnreadable }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveClientAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state?.fieldErrors ?? {};

  // Clear any typed secrets after a successful save, so they don't linger in the page.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.querySelectorAll<HTMLInputElement>("input[data-secret]").forEach((el) => (el.value = ""));
      formRef.current?.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((el) => (el.checked = false));
    }
  }, [state]);

  const text = (key: string, title: string, o: { placeholder?: string; help?: string } = {}) => (
    <div>
      <label htmlFor={key} className={label}>{title}</label>
      <input id={key} name={key} defaultValue={settings[key] ?? ""} placeholder={o.placeholder} autoComplete="off" spellCheck={false} className={input} aria-invalid={Boolean(errors[key])} />
      {errors[key] ? <p className={errorText}>{errors[key]}</p> : o.help && <p className={hint}>{o.help}</p>}
    </div>
  );

  const secret = (key: string, title: string, o: { placeholder?: string; help?: string } = {}) => {
    const isSet = Boolean(secretsSet[key]);
    return (
      <div>
        <label htmlFor={`secret_${key}`} className={label}>
          {title} {isSet && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Saved</span>}
        </label>
        <input
          id={`secret_${key}`}
          name={`secret_${key}`}
          data-secret
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          placeholder={isSet ? "Saved. Type to replace it" : o.placeholder}
          className={input}
          aria-invalid={Boolean(errors[`secret_${key}`])}
        />
        {errors[`secret_${key}`] ? (
          <p className={errorText}>{errors[`secret_${key}`]}</p>
        ) : (
          o.help && <p className={hint}>{o.help}</p>
        )}
        {isSet && (
          <label className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" name={`remove_${key}`} /> Remove the saved value
          </label>
        )}
      </div>
    );
  };

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        e.preventDefault(); // handled below so a validation error doesn't wipe what was typed
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={id} />

      {secretsUnreadable && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The keys saved for this client can&apos;t be read, because the <code>ENCRYPTION_KEY</code> on this server is different from the one they were saved with.
          Make sure the same <code>ENCRYPTION_KEY</code> is set locally and on Vercel, or re-enter the keys below.
        </p>
      )}

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">Client</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className={label}>Name</label>
            <input id="name" name="name" defaultValue={name} required className={input} aria-invalid={Boolean(errors.name)} />
            {errors.name && <p className={errorText}>{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="timezone" className={label}>Timezone</label>
            <input id="timezone" name="timezone" defaultValue={timezone} placeholder="Europe/London" autoComplete="off" className={input} aria-invalid={Boolean(errors.timezone)} />
            {errors.timezone && <p className={errorText}>{errors.timezone}</p>}
          </div>
        </div>
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">GoHighLevel</h2>
          <p className={hint}>Where this client&apos;s leads are sent. In their GHL sub-account: Settings, then Private Integrations. Give the token the scopes for contacts, plus <code>locations.readonly</code> (for the test) and <code>lc-email.readonly</code> (email checks).</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("ghlLocationId", "Location ID", { placeholder: "e.g. 5DP4iH6HLkQsiKESj6rh", help: "Settings, then Business Profile, in the sub-account." })}
          {secret("ghlPit", "Private access token", { placeholder: "pit-…" })}
        </div>
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">Meta (Facebook) Pixel and Conversions API</h2>
          <p className={hint}>Events are sent from the browser (Pixel) and from our server (Conversions API), with matching event IDs so Meta doesn&apos;t count them twice.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("metaPixelId", "Pixel / Dataset ID", { placeholder: "1234567890123456" })}
          {secret("metaCapiToken", "Conversions API access token", { placeholder: "EAA…", help: "Events Manager, your dataset, Settings, Generate access token." })}
          {text("metaTestEventCode", "Test event code (optional)", { placeholder: "TEST12345", help: "While set, events show under Test Events and don't count. Clear it to go live." })}
        </div>
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">Google (optional)</h2>
          <p className={hint}>GA4 and Google Ads conversion tracking.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("ga4MeasurementId", "GA4 Measurement ID", { placeholder: "G-XXXXXXXXXX" })}
          {secret("ga4ApiSecret", "GA4 API secret", { help: "GA4, Admin, Data streams, Measurement Protocol API secrets." })}
          {text("googleAdsConversionId", "Google Ads ID", { placeholder: "AW-123456789" })}
          {text("googleAdsConversionLabel", "Google Ads conversion label")}
          {text("gtmId", "Google Tag Manager ID", { placeholder: "GTM-XXXXXXX" })}
        </div>
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">Webhook (optional)</h2>
          <p className={hint}>Also send every submission to a URL, for example an n8n workflow.</p>
        </div>
        {secret("webhookUrl", "Webhook URL", { placeholder: "https://…" })}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btn}>{pending ? "Saving…" : "Save changes"}</button>
        {state?.ok && <p role="status" className="text-sm font-medium text-green-700">{state.message}</p>}
        {state?.error && <p role="alert" className={errorText}>{state.error}</p>}
      </div>
    </form>
  );
}
