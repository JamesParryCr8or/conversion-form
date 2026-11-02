"use client";

import { useActionState, useState } from "react";
import { createStarterFormAction, importFormAction, type ActionState } from "@/app/admin/actions";
import { btn, btnGhost, errorText, hint, input, label } from "./ui";

export function NewFormPanel({ clientId }: { clientId: string }) {
  const [starter, starterAction, starterPending] = useActionState<ActionState, FormData>(createStarterFormAction, null);
  const [imported, importAction, importPending] = useActionState<ActionState, FormData>(importFormAction, null);
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form action={starterAction}>
          <input type="hidden" name="id" value={clientId} />
          <button type="submit" disabled={starterPending} className={btn}>{starterPending ? "Creating…" : "New form from the starter template"}</button>
        </form>
        <button type="button" className={btnGhost} onClick={() => setShowImport((s) => !s)}>{showImport ? "Cancel import" : "Import a form (JSON)"}</button>
      </div>
      <Message state={starter} />

      {showImport && (
        <form action={importAction} className="space-y-2">
          <input type="hidden" name="id" value={clientId} />
          <label htmlFor="json" className={label}>Paste the exported form JSON</label>
          <textarea id="json" name="json" required rows={8} spellCheck={false} className={`${input} font-mono text-xs`} placeholder='{ "schemaVersion": 1, "form": { ... } }' />
          <p className={hint}>Files containing keys like tokens or pixel IDs are refused: those belong in the client settings, not the form.</p>
          <button type="submit" disabled={importPending} className={btn}>{importPending ? "Importing…" : "Import and publish"}</button>
          <Message state={imported} />
        </form>
      )}
    </div>
  );
}

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="text-sm font-medium text-green-700">✓ {state.message}</p>
  ) : (
    <p role="alert" className={`${errorText} whitespace-pre-line`}>{state.error}</p>
  );
}
