"use client";
/* eslint-disable @next/next/no-img-element -- signed, short-lived media URLs */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { CardContent } from "@/lib/schemas/card";
import { saveCardAction } from "@/server/ecard/actions";

type TemplateOption = { id: string; name: string; style: { primary: string; background: string; accent: string; layout: string; font: string } };

const input = "mt-1 block min-h-11 w-full rounded-xl border bg-[var(--st-ground-deep)] px-3";

export function CardBuilder({
  eventId,
  templates,
  initial,
  photos,
  musicUrl,
}: {
  eventId: string;
  templates: TemplateOption[];
  initial: CardContent & { templateId: string; published: boolean };
  photos: { key: string; url: string }[];
  musicUrl: string | null;
}) {
  const t = useTranslations("ecard");
  const router = useRouter();
  const [card, setCard] = useState(initial);
  const [status, setStatus] = useState<{ kind: "saved" | "invalid" | "error"; fields?: string[] } | null>(null);
  const [saving, startSaving] = useTransition();
  const [uploading, setUploading] = useState<"photo" | "music" | null>(null);

  const set = <K extends keyof typeof card>(key: K, value: (typeof card)[K]) => setCard((c) => ({ ...c, [key]: value }));
  const bad = (field: string) => status?.fields?.some((f) => f === field || f.startsWith(`${field}.`));
  const border = (field: string) => (bad(field) ? "border-danger" : "border-[var(--st-line)]");

  function save() {
    startSaving(async () => {
      const result = await saveCardAction(eventId, card);
      if (result.ok) {
        setStatus({ kind: "saved" });
        router.refresh();
      } else setStatus({ kind: result.error === "validation" ? "invalid" : "error", fields: result.fields });
    });
  }

  async function upload(kind: "photo" | "music", file: File | null, method: "POST" | "DELETE" = "POST", key?: string) {
    setUploading(kind);
    const body = file ? new FormData() : undefined;
    if (file && body) body.set("file", file);
    const url = `/api/events/${eventId}/card/${kind}${key ? `?key=${encodeURIComponent(key)}` : ""}`;
    const response = await fetch(url, { method, body }).catch(() => null);
    setUploading(null);
    if (!response?.ok) setStatus({ kind: "error" });
    router.refresh();
  }

  const text = (key: "headline" | "intro" | "hostLine" | "names" | "note", rows = 1) => (
    <label className="block">
      <span className="text-sm font-medium">{t(key)}</span>
      {rows > 1 ? (
        <textarea value={card[key]} rows={rows} onChange={(e) => set(key, e.target.value)} className={`mt-1 block w-full rounded-xl border bg-[var(--st-ground-deep)] p-3 ${border(key)}`} />
      ) : (
        <input value={card[key]} onChange={(e) => set(key, e.target.value)} className={`${input} ${border(key)}`} />
      )}
    </label>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-serif text-2xl">{t("template")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => set("templateId", tpl.id)}
              aria-pressed={card.templateId === tpl.id}
              className={`rounded-2xl border-2 p-2 text-left ${card.templateId === tpl.id ? "border-ink" : "border-transparent"}`}
            >
              <span className="flex aspect-[3/4] flex-col items-center justify-center rounded-xl p-2 text-center" style={{ backgroundColor: tpl.style.background }}>
                <span className="block h-1 w-8 rounded-full" style={{ backgroundColor: tpl.style.accent }} />
                {/* stori-keep: a template preview keeps its own font; font-serif would turn into the dusk display font inside .stori */}
                <span
                  className={`mt-2 text-sm ${tpl.style.font === "serif" ? "" : "font-sans font-semibold"}`}
                  style={{ color: tpl.style.primary, fontFamily: tpl.style.font === "serif" ? 'ui-serif, Georgia, "Times New Roman", serif' : undefined }} // stori-keep
                >
                  A &amp; D
                </span>
              </span>
              <span className="mt-1 block text-xs font-medium">{tpl.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl">{t("content")}</h2>
        <p className="text-sm text-muted">{t("detailsNote")}</p>
        {text("headline")}
        {text("intro", 3)}
        {text("hostLine")}
        {text("names")}
        {text("note", 3)}
      </section>

      <section>
        <h3 className="font-medium">{t("schedule")}</h3>
        <div className="mt-2 space-y-2">
          {card.schedule.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label={t("scheduleTime")}
                value={row.time}
                placeholder="11:00"
                onChange={(e) => set("schedule", card.schedule.map((r, j) => (j === i ? { ...r, time: e.target.value } : r)))}
                className={`${input} w-24 ${border(`schedule.${i}`)}`}
              />
              <input
                aria-label={t("scheduleLabel")}
                value={row.label}
                onChange={(e) => set("schedule", card.schedule.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                className={`${input} flex-1 ${border(`schedule.${i}`)}`}
              />
              <button type="button" onClick={() => set("schedule", card.schedule.filter((_, j) => j !== i))} className="min-h-11 px-2 text-sm text-danger">
                {t("remove")}
              </button>
            </div>
          ))}
          {card.schedule.length < 6 ? (
            <button type="button" onClick={() => set("schedule", [...card.schedule, { time: "", label: "" }])} className="min-h-11 text-sm font-medium underline">
              + {t("addRow")}
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="font-medium">{t("contacts")}</h3>
        <div className="mt-2 space-y-2">
          {card.contacts.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label={t("contactName")}
                placeholder={t("contactName")}
                value={row.name}
                onChange={(e) => set("contacts", card.contacts.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                className={`${input} flex-1 ${border(`contacts.${i}`)}`}
              />
              <input
                aria-label={t("contactPhone")}
                placeholder="012-345 6789"
                inputMode="tel"
                value={row.phone}
                onChange={(e) => set("contacts", card.contacts.map((r, j) => (j === i ? { ...r, phone: e.target.value } : r)))}
                className={`${input} w-36 ${border(`contacts.${i}`)}`}
              />
              <button type="button" onClick={() => set("contacts", card.contacts.filter((_, j) => j !== i))} className="min-h-11 px-2 text-sm text-danger">
                {t("remove")}
              </button>
            </div>
          ))}
          {card.contacts.length < 3 ? (
            <button type="button" onClick={() => set("contacts", [...card.contacts, { name: "", phone: "" }])} className="min-h-11 text-sm font-medium underline">
              + {t("addContact")}
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="font-medium">{t("photos")}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div key={photo.key} className="relative">
              <img src={photo.url} alt="" className="size-24 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => void upload("photo", null, "DELETE", photo.key)}
                className="absolute top-1 right-1 rounded-full bg-white/90 px-2 text-xs text-red-700" /* stori-keep: over a photo */
              >
                {t("remove")}
              </button>
            </div>
          ))}
          {photos.length < 3 ? (
            <label className="flex size-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-[var(--st-line)] text-center text-xs">
              {uploading === "photo" ? t("uploading") : `+ ${t("addPhoto")}`}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                data-testid="card-photo-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload("photo", file);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="font-medium">{t("music")}</h3>
        {musicUrl ? <audio controls src={musicUrl} className="mt-2 w-full" /> : null}
        <div className="mt-2 flex gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[var(--st-line)] bg-surface px-4 text-sm font-medium">
            {uploading === "music" ? t("uploading") : t("addMusic")}
            <input
              type="file"
              accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload("music", file);
                e.target.value = "";
              }}
            />
          </label>
          {musicUrl ? (
            <button type="button" onClick={() => void upload("music", null, "DELETE")} className="min-h-11 px-3 text-sm text-danger underline">
              {t("removeMusic")}
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-[var(--st-line)]">
        <h2 className="font-serif text-2xl">{t("rsvpTitle")}</h2>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={card.rsvpEnabled} onChange={(e) => set("rsvpEnabled", e.target.checked)} className="size-5" />
          {t("rsvpEnabled")}
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("rsvpDeadline")}</span>
          <input type="date" value={card.rsvpDeadline ?? ""} onChange={(e) => set("rsvpDeadline", e.target.value || null)} className={`${input} w-48 ${border("rsvpDeadline")}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("maxPax")}</span>
          <input
            type="number"
            min={1}
            max={20}
            value={card.maxPax}
            onChange={(e) => set("maxPax", Number(e.target.value))}
            className={`${input} w-24 ${border("maxPax")}`}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={card.askPhone} onChange={(e) => set("askPhone", e.target.checked)} className="size-5" />
          {t("askPhone")}
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={card.showGuestbook} onChange={(e) => set("showGuestbook", e.target.checked)} className="size-5" />
          {t("showGuestbook")}
        </label>
      </section>

      <section className="sticky bottom-0 -mx-4 space-y-2 border-t border-[var(--st-line)] bg-cream p-4 backdrop-blur">
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" checked={card.published} onChange={(e) => set("published", e.target.checked)} className="mt-1 size-5" />
          <span>
            <span className="font-medium">{t("published")}</span>
            <span className="block text-sm text-muted">{t("publishedHelp")}</span>
          </span>
        </label>
        {status ? (
          <p role={status.kind === "saved" ? "status" : "alert"} className={status.kind === "saved" ? "text-success" : "text-danger"}>
            {t(status.kind === "saved" ? "saved" : status.kind === "invalid" ? "invalid" : "error")}
          </p>
        ) : null}
        <button type="button" disabled={saving} onClick={save} className="min-h-12 w-full rounded-full bg-brand font-medium text-on-brand disabled:opacity-60">
          {t("save")}
        </button>
      </section>
    </div>
  );
}