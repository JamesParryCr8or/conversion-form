"use client";

import { useActionState } from "react";
import { testGhlAction, testMetaAction, type ActionState } from "@/app/admin/actions";
import { btnGhost, card, errorText, hint } from "./ui";

/** Tests use the SAVED values, so typed secrets are never sent twice. Save first, then test. */
export function ConnectionTests({ id, hasGhl, hasMeta }: { id: string; hasGhl: boolean; hasMeta: boolean }) {
  const [ghl, ghlAction, ghlPending] = useActionState<ActionState, FormData>(testGhlAction, null);
  const [meta, metaAction, metaPending] = useActionState<ActionState, FormData>(testMetaAction, null);

  return (
    <section className={`${card} space-y-3`}>
      <div>
        <h2 className="font-semibold">Test connections</h2>
        <p className={hint}>Checks the saved details work. Save your changes first.</p>
      </div>
      <div className="flex flex-wrap gap-6">
        <form action={ghlAction} className="space-y-1">
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={ghlPending || !hasGhl} className={btnGhost}>{ghlPending ? "Testing…" : "Test GoHighLevel"}</button>
          <Result state={ghl} />
        </form>
        <form action={metaAction} className="space-y-1">
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={metaPending || !hasMeta} className={btnGhost}>{metaPending ? "Testing…" : "Test Meta"}</button>
          <Result state={meta} />
        </form>
      </div>
    </section>
  );
}

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="max-w-xs text-xs font-medium text-green-700">✓ {state.message}</p>
  ) : (
    <p role="alert" className={`${errorText} max-w-xs`}>{state.error}</p>
  );
}
