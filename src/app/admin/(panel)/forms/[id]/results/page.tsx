import Link from "next/link";
import { notFound } from "next/navigation";
import { retryCrmAction } from "@/app/admin/actions";
import { btn, btnGhost, card, hint } from "@/components/admin/ui";
import { getFormResults } from "@/server/admin-data";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

export default async function FormResultsPage({ params }: PageProps<"/admin/forms/[id]/results">) {
  const { id } = await params;
  const data = await getFormResults(id);
  if (!data) notFound();
  const { form, columns, rows, summary, crmConfigured } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${form.subAccountId}`} className="text-sm text-indigo-600 hover:underline">← Back to client</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Results: {form.name}</h1>
            <p className="text-xs text-gray-500">/f/{form.slug} · {form.status === "published" ? "Live" : "Off"}</p>
          </div>
          <Link href={`/admin/forms/${form.id}/edit`} className={btnGhost}>Edit in builder</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Started" value={summary.total} />
        <Stat label="Completed" value={summary.completed} />
        <Stat label="In progress" value={summary.inProgress} />
        <Stat label="Sent to GHL" value={summary.sentToCrm} />
      </div>

      {!crmConfigured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          GHL isn&apos;t set up for this client, so completed leads aren&apos;t sent anywhere. Add the Location ID and private token under Where this client&apos;s data goes.
        </p>
      )}

      {rows.length === 0 ? (
        <div className={`${card} text-sm text-gray-600`}>No submissions yet. Once someone starts the form, their answers appear here.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">When</th>
                <th className="whitespace-nowrap px-3 py-2">Status</th>
                <th className="whitespace-nowrap px-3 py-2">GHL</th>
                <th className="whitespace-nowrap px-3 py-2">Source</th>
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 normal-case tracking-normal" title={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{dateFormat.format(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "completed" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {r.status === "completed" ? "Completed" : "In progress"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.crm === "sent" && <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Sent</span>}
                    {r.crm === "n/a" && <span className="text-gray-400">—</span>}
                    {(r.crm === "failed" || r.crm === "not_sent") && (
                      <div className="space-y-1">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${r.crm === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                          {r.crm === "failed" ? "Failed" : "Not sent"}
                        </span>
                        {r.crmError && <p className="max-w-xs text-xs text-red-700">{r.crmError}</p>}
                        <form action={retryCrmAction}>
                          <input type="hidden" name="formId" value={form.id} />
                          <input type="hidden" name="submissionId" value={r.id} />
                          <button type="submit" className={`${btnGhost} px-2 py-1 text-xs`}>Retry</button>
                        </form>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{r.params.utm_source ?? r.params.source ?? "—"}</td>
                  {columns.map((c) => {
                    const text = r.answers[c.key] ?? "";
                    return (
                      <td key={c.key} className="max-w-xs px-3 py-2 text-gray-900" title={text || undefined}>
                        <span className="line-clamp-3 break-words">{text || <span className="text-gray-300">—</span>}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={hint}>Showing the latest 300 submissions. Hover a long answer to see all of it.</p>
      <div>
        <Link href={`/admin/clients/${form.subAccountId}`} className={btn}>Back to client</Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
