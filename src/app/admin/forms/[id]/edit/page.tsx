import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormEditor } from "@/components/editor/FormEditor";
import { getFormForEdit } from "@/server/admin-data";

// Full-screen builder (outside the admin panel layout). Signed-in check happens in getFormForEdit.
export default function EditFormPage({ params }: PageProps<"/admin/forms/[id]/edit">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-500">Loading the builder…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/admin/forms/[id]/edit">["params"] }) {
  const { id } = await params;
  const form = await getFormForEdit(id); // redirects to /admin/login when signed out
  if (!form) notFound();
  return (
    <FormEditor
      formId={form.id}
      slug={form.slug}
      initialDraft={form.draft}
      initialName={(form.draft as { form?: { name?: string } })?.form?.name ?? "Form"}
      publishedVersion={form.publishedVersion}
      hasUnpublishedChanges={form.hasUnpublishedChanges}
      client={form.client}
    />
  );
}
