import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FormRenderer } from "@/components/form/FormRenderer";
import { getPublishedForm } from "@/server/forms";

export const metadata: Metadata = {
  title: "Form",
  robots: { index: false }, // forms are reached by link or embed, not search
};

// With Cache Components, reading params and the database must happen inside <Suspense>.
export default function FormPage({ params }: PageProps<"/f/[slug]">) {
  return (
    <Suspense fallback={<p className="grid min-h-dvh place-items-center opacity-60">Loading…</p>}>
      <LoadedForm params={params} />
    </Suspense>
  );
}

async function LoadedForm({ params }: { params: PageProps<"/f/[slug]">["params"] }) {
  const { slug } = await params;
  const published = await getPublishedForm(slug);
  if (!published) notFound();
  return <FormRenderer slug={slug} funnel={published.funnel} />;
}
