import Link from "next/link";
import { AddClientForm } from "@/components/admin/AddClientForm";
import { card } from "@/components/admin/ui";
import { listClients } from "@/server/admin-data";

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clients</h1>
      <AddClientForm />

      {clients.length === 0 ? (
        <p className="text-sm text-gray-500">No clients yet. Add your first one above.</p>
      ) : (
        <ul className="grid gap-3">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/clients/${c.id}`} className={`${card} flex flex-wrap items-center justify-between gap-3 hover:border-indigo-300`}>
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.slug}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge on={c.ghlConnected}>GHL</Badge>
                  <Badge on={c.metaConnected}>Meta</Badge>
                  <span className="text-gray-500">{c.forms} form{c.forms === 1 ? "" : "s"}</span>
                  <span className="text-gray-500">{c.completed} of {c.submissions} completed</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-medium ${on ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
      {children}{on ? " ✓" : ""}
    </span>
  );
}
