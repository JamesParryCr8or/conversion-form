"use client";

import { useActionState } from "react";
import { createClientAction, type ActionState } from "@/app/admin/actions";
import { btn, card, errorText, hint, input, label } from "./ui";

export function AddClientForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createClientAction, null);
  return (
    <form action={action} className={`${card} flex flex-col gap-3 sm:flex-row sm:items-end`}>
      <div className="flex-1">
        <label htmlFor="name" className={label}>Add a client</label>
        <input id="name" name="name" required minLength={2} maxLength={80} placeholder="e.g. Acme Plumbing" className={input} aria-invalid={Boolean(state?.fieldErrors?.name)} />
        {state?.fieldErrors?.name ? <p className={errorText}>{state.fieldErrors.name}</p> : <p className={hint}>You&apos;ll add their GHL and tracking details on the next screen.</p>}
      </div>
      <button type="submit" disabled={pending} className={btn}>{pending ? "Adding…" : "Add client"}</button>
    </form>
  );
}
