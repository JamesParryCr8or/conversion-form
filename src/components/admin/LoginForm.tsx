"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/app/admin/actions";
import { btn, card, errorText, input, label } from "./ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, null);
  return (
    <form action={action} className={`${card} w-full max-w-sm space-y-4`}>
      <div>
        <label htmlFor="email" className={label}>Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus className={input} />
      </div>
      <div>
        <label htmlFor="password" className={label}>Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      {state?.error && <p role="alert" className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btn} w-full`}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
