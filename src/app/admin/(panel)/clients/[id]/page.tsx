import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createBlankFormAction, setFormStatusAction } from "@/app/admin/actions";
import { ClientSettingsForm } from "@/components/admin/ClientSettingsForm";
import { ConnectionTests } from "@/components/admin/ConnectionTests";
import { DeleteFormButton } from "@/components/admin/DeleteFormButton";
import { EmbedPanel } from "@/components/admin/EmbedPanel";
import { NewFormPanel } from "@/components/admin/NewFormPanel";
import { btn, btnGhost, card, hint } from "@/components/admin/ui";
import { getClientView } from "@/server/admin-data";

export default async function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  const { id } = await params;
  const view = await getClientView(id);
  if (!view) notFound();
  const { account, secrets, forms } = view;

  // Embed codes must point at the address this admin is being used on (the custom domain, once there is one).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-indigo-600 hover:underline">← All clients</Link>
        <h1 className="mt-1 text-2xl font-bold">{account.name}</h1>
        <p className="text-xs text-gray-500">{account.slug}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Forms and embed codes</h2>
        {forms.length === 0 && <p className="text-sm text-gray-500">No forms yet. Create one below.</p>}
        {forms.map((f) => (
          <div key={f.id} className={`${card} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{f.name}</p>
                <p className="text-xs text-gray-500">
                  /f/{f.slug} · {f.completed} of {f.total} completed
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/forms/${f.id}/edit`} className={btn}>Edit in builder</Link>
                <Link href={`/admin/forms/${f.id}/results`} className={btnGhost}>Results</Link>
                <DeleteFormButton formId={f.id} name={f.name} submissions={f.total} />
                {f.published ? (
                  <form action={setFormStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="formId" value={f.id} />
                    <input type="hidden" name="status" value={f.status === "published" ? "draft" : "published"} />
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.status === "published" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {f.status === "published" ? "Live" : "Off"}
                    </span>
                    <button type="submit" className={btnGhost}>{f.status === "published" ? "Turn off" : "Turn on"}</button>
                  </form>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Not published yet</span>
                )}
              </div>
            </div>
            {f.published && f.status === "published" ? (
              <EmbedPanel appUrl={appUrl} slug={f.slug} />
            ) : (
              <p className={hint}>{f.published ? "This form is off, so its link and embed show nothing. Turn it on to use it." : "Open the builder and press Publish to make it live and get its embed code."}</p>
            )}
          </div>
        ))}
        <form action={createBlankFormAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={account.id} />
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-800">Build a new form</span>
            <input name="name" placeholder="Form name, e.g. Boiler quote" className="w-64 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" className={btn}>Create and open builder</button>
        </form>
        <NewFormPanel clientId={account.id} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Where this client&apos;s data goes</h2>
        <ClientSettingsForm
          id={account.id}
          name={account.name}
          timezone={account.timezone}
          settings={account.settings}
          secretsSet={secrets.set}
          secretsUnreadable={secrets.unreadable}
        />
        <ConnectionTests id={account.id} hasGhl={Boolean(account.settings.ghlLocationId && secrets.set.ghlPit)} hasMeta={Boolean(account.settings.metaPixelId && secrets.set.metaCapiToken)} />
        <p className={hint}>
          Saving keeps these details for this client only. Completed leads go to GHL as contacts with a note of all their answers. Meta and Google events are not sent yet.
        </p>
      </section>
    </div>
  );
}
