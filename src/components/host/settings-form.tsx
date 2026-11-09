"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/events/actions";

export type SettingsLabels = Record<
  | "visibility"
  | "private"
  | "guests"
  | "approval"
  | "approvalHelp"
  | "shots"
  | "shotsHelp"
  | "shotsUnlimited"
  | "pin"
  | "pinHelp"
  | "pinSet"
  | "removePin"
  | "save"
  | "saved"
  | "invalid",
  string
>;

export function SettingsForm({
  action,
  defaults,
  labels,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: { galleryVisibility: "PRIVATE" | "GUESTS"; requireApproval: boolean; hasPin: boolean; shotsPerGuest: number | null };
  labels: SettingsLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.errors?.length ? (
        <p role="alert" className="rounded-lg bg-surface p-3 text-danger ring-1 ring-[var(--color-danger)]">
          {labels.invalid}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-lg bg-surface p-3 text-success ring-1 ring-[var(--color-success)]">
          {labels.saved}
        </p>
      ) : null}
      <fieldset>
        <legend className="text-sm font-medium">{labels.visibility}</legend>
        {(["PRIVATE", "GUESTS"] as const).map((value) => (
          <label key={value} className="mt-2 flex min-h-11 items-center gap-3">
            <input type="radio" name="galleryVisibility" value={value} defaultChecked={defaults.galleryVisibility === value} className="size-5" />
            <span>{value === "PRIVATE" ? labels.private : labels.guests}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="requireApproval" defaultChecked={defaults.requireApproval} className="mt-1 size-5" />
        <span>
          <span className="font-medium">{labels.approval}</span>
          <span className="block text-sm text-muted">{labels.approvalHelp}</span>
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">{labels.shots}</span>
        <input
          name="shotsPerGuest"
          // Remount when the saved value changes: the form reset after saving would otherwise show the old default.
          key={defaults.shotsPerGuest ?? "none"}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          defaultValue={defaults.shotsPerGuest ?? ""}
          placeholder={labels.shotsUnlimited}
          className="mt-1 block min-h-12 w-40 rounded-xl border border-[var(--st-line)] bg-[var(--st-ground-deep)] px-4"
        />
        <span className="mt-1 block text-sm text-muted">{labels.shotsHelp}</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium">{labels.pin}</span>
        <input
          name="pin"
          inputMode="numeric"
          pattern="\d{4,8}"
          maxLength={8}
          autoComplete="off"
          className="mt-1 block min-h-12 w-40 rounded-xl border border-[var(--st-line)] bg-[var(--st-ground-deep)] px-4 tracking-widest"
        />
        <span className="mt-1 block text-sm text-muted">{labels.pinHelp}</span>
      </label>
      {defaults.hasPin ? (
        <div className="rounded-xl bg-surface p-3 text-sm">
          <p>{labels.pinSet}</p>
          <label className="mt-2 flex min-h-11 items-center gap-3">
            <input type="checkbox" name="clearPin" className="size-5" />
            <span>{labels.removePin}</span>
          </label>
        </div>
      ) : null}
      <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-brand px-6 font-medium text-on-brand disabled:opacity-60">
        {labels.save}
      </button>
    </form>
  );
}