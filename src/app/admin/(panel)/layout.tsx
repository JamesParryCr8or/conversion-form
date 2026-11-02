import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/app/admin/actions";
import { btnGhost } from "@/components/admin/ui";
import { requireAdmin } from "@/server/admin-auth";

// Reading the session cookie is request-time data, so it lives inside <Suspense>.
export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-500">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // redirects to /admin/login if not signed in
  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-bold">CR8OR Forms <span className="font-normal text-gray-500">admin</span></Link>
          <form action={logoutAction} className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-500 sm:inline">{admin.email}</span>
            <button type="submit" className={btnGhost}>Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
