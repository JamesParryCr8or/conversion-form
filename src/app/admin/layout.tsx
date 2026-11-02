import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CR8OR Forms admin",
  robots: { index: false, follow: false },
};

// Fixed light theme so the admin reads the same regardless of the visitor's colour scheme.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-dvh bg-gray-50 text-gray-900 antialiased">{children}</div>;
}
