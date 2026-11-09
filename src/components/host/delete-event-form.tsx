"use client";

import { useActionState } from "react";
import type { DeleteFormState } from "@/server/moderation/actions";

export function DeleteEventForm({
  action,
  slug,
  labels,
}: {
  action: (state: DeleteFormState, formData: FormData) => Promise<DeleteFormState>;
  slug: string;
  labels: { title: string; body: string; confirmLabel: string; button: string; confirm: string; has_payments: string; forbidden: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="rounded-2xl border-2 border-danger bg-surface p-5">
      <h2 className="font-serif text-2xl text-danger">{labels.title}</h2>
      <p className="mt-2 text-sm text-danger">{labels.body}</p>
      <label className="mt-4 block">
        <span className="text-sm font-medium">{labels.confirmLabel}</span>
        <input name="confirm" autoComplete="off" className="mt-1 block min-h-11 w-full rounded-xl border border-danger bg-[var(--st-ground-deep)] px-4 font-mono" placeholder={slug} />
      </label>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {labels[state.error]}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="mt-3 min-h-11 rounded-full bg-danger px-5 text-sm font-medium text-on-brand disabled:opacity-50">
        {labels.button}
      </button>
    </form>
  );
}