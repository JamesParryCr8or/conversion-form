"use client";

import { useState } from "react";
import { deleteFormAction } from "@/app/admin/actions";
import { btnGhost, input, hint } from "./ui";

/** Two steps: open, then type the exact form name. Nothing is deleted until the name matches. */
export function DeleteFormButton({ formId, name, submissions }: { formId: string; name: string; submissions: number }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === name;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btnGhost} text-red-700 hover:bg-red-50`}>
        Delete
      </button>
    );
  }

  return (
    <form action={deleteFormAction} className="w-full space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="formId" value={formId} />
      <p className="text-sm text-red-900">
        Delete <strong>{name}</strong> for good?
        {submissions > 0 && <> This also deletes its <strong>{submissions}</strong> submission{submissions === 1 ? "" : "s"} (leads), and they can&apos;t be recovered.</>}
        {" "}Its link and embed will stop working.
      </p>
      <label className="block text-xs font-medium text-red-900">
        Type the form name to confirm
        <input
          name="confirmName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoComplete="off"
          className={`${input} mt-1`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!matches} className="inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
          Delete forever
        </button>
        <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className={btnGhost}>Cancel</button>
        {!matches && <span className={hint}>The name has to match exactly.</span>}
      </div>
    </form>
  );
}
