"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/events/actions";

export type EventFormValues = {
  type: string;
  title: string;
  hostNames: string;
  startsAtLocal: string;
  venueName: string;
  venueAddress: string;
  googleMapsUrl: string;
  wazeUrl: string;
  welcomeText: string;
  themeColor: string;
};

export type EventFormLabels = Record<
  | "type"
  | "title"
  | "titlePlaceholder"
  | "hostNames"
  | "hostNamesPlaceholder"
  | "startsAt"
  | "venueName"
  | "venueAddress"
  | "googleMapsUrl"
  | "wazeUrl"
  | "welcomeText"
  | "welcomePlaceholder"
  | "themeColor"
  | "submit"
  | "invalid"
  | "saved"
  | "optional",
  string
> & { types: Record<string, string> };

const input = "mt-1 block min-h-12 w-full rounded-xl border bg-surface px-4";

export function EventForm({
  action,
  defaults,
  labels,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: EventFormValues;
  labels: EventFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const bad = (name: string) => state.errors?.includes(name);
  const border = (name: string) => (bad(name) ? "border-danger" : "border-ink/20");

  const text = (name: keyof EventFormValues, label: string, opts: { placeholder?: string; required?: boolean; type?: string } = {}) => (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {opts.required ? null : <span className="font-normal text-ink/50"> ({labels.optional})</span>}
      </span>
      <input
        name={name}
        type={opts.type ?? "text"}
        defaultValue={defaults[name]}
        placeholder={opts.placeholder}
        required={opts.required}
        aria-invalid={bad(name) || undefined}
        className={`${input} ${border(name)}`}
      />
    </label>
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.errors?.length ? (
        <p role="alert" className="rounded-lg bg-surface p-3 text-danger">
          {labels.invalid}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">
          {labels.saved}
        </p>
      ) : null}
      <label className="block">
        <span className="text-sm font-medium">{labels.type}</span>
        <select name="type" defaultValue={defaults.type} className={`${input} ${border("type")}`}>
          {Object.entries(labels.types).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {text("title", labels.title, { placeholder: labels.titlePlaceholder, required: true })}
      {text("hostNames", labels.hostNames, { placeholder: labels.hostNamesPlaceholder, required: true })}
      {text("startsAtLocal", labels.startsAt, { type: "datetime-local", required: true })}
      {text("venueName", labels.venueName)}
      {text("venueAddress", labels.venueAddress)}
      {text("googleMapsUrl", labels.googleMapsUrl, { type: "url", placeholder: "https://maps.app.goo.gl/…" })}
      {text("wazeUrl", labels.wazeUrl, { type: "url", placeholder: "https://waze.com/ul/…" })}
      <label className="block">
        <span className="text-sm font-medium">
          {labels.welcomeText} <span className="font-normal text-ink/50">({labels.optional})</span>
        </span>
        <textarea
          name="welcomeText"
          defaultValue={defaults.welcomeText}
          placeholder={labels.welcomePlaceholder}
          rows={3}
          maxLength={500}
          className={`mt-1 block w-full rounded-xl border bg-surface p-4 ${border("welcomeText")}`}
        />
      </label>
      <label className="flex items-center gap-3">
        <input type="color" name="themeColor" defaultValue={defaults.themeColor} className="h-12 w-16 rounded-lg border border-ink/20" />
        <span className="text-sm font-medium">{labels.themeColor}</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-full bg-brand px-6 font-medium text-on-brand hover:bg-brand-dark disabled:opacity-60 sm:w-auto"
      >
        {labels.submit}
      </button>
    </form>
  );
}