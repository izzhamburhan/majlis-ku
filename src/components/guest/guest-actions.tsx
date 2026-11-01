"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BackIcon, Bunga, CameraIcon, GalleryIcon, MyPhotos, VideoIcon, VoiceIcon, WishIcon } from "./guest-ui";
import { compressImage, postJson, UploadError, uploadOne, type Stage } from "./upload-client";

// Loaded only when the guest opens Video or Voice, so the first page load stays small.
const VideoPicker = dynamic(() => import("./video-picker"), { ssr: false });
const VoiceRecorder = dynamic(() => import("./voice-recorder"), { ssr: false });

type View = "pin" | "name" | "menu" | "video" | "voice" | "wish" | "thanks";

type QueueItem = { id: number; file: File; url: string; stage: Stage | "queued" | "failed"; progress: number; error?: string };

const NAME_KEY = "mk_name";
const CONSENT_KEY = "mk_consent";
const CONCURRENCY = 2;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the cookie still identifies the device.
  }
}

const KNOWN_ERRORS = [
  "limit_reached",
  "storage_full",
  "too_large",
  "too_long",
  "invalid_type",
  "invalid_file",
  "gallery_not_in_plan",
  "video_not_in_plan",
  "rate_limited",
  "shots_used_up",
] as const;

// Inside the paper sheet the shared pickers keep their ink styles; their brand colour becomes the host's deep ground.
const paperVars = { "--color-brand": "var(--sk-ground)", "--color-ink": "#2a211a" } as CSSProperties;

export function GuestActions({
  slug,
  privacyHref,
  needsPin,
  initialName,
  galleryHref,
  features,
  shots,
}: {
  slug: string;
  /** Locale-aware path of the privacy page, built by the server page. */
  privacyHref: string;
  needsPin: boolean;
  initialName: string | null;
  galleryHref: string | null;
  /** What this event's plan allows. Video needs a plan with video; the server checks again. */
  features: { video: boolean; voice: boolean; maxVideoSeconds: number };
  /** Disposable-camera mode: the event's limit and what this guest has used. The server enforces it. */
  shots: { limit: number; used: number } | null;
}) {
  const t = useTranslations("guest");
  const [view, setView] = useState<View>(needsPin ? "pin" : initialName ? "menu" : "name");
  const [name, setName] = useState(initialName ?? "");
  const [consent, setConsent] = useState(false);
  // Forms submit only through script. Until hydration their buttons stay disabled, so an early tap
  // can never fall back to a native GET that would put the guest's name in the URL.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [usedShots, setUsedShots] = useState(shots?.used ?? 0);
  const [skipped, setSkipped] = useState(0);
  const [processingNote, setProcessingNote] = useState(false);
  const nextId = useRef(1);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!initialName) setName(storageGet(NAME_KEY) ?? "");
    setConsent(storageGet(CONSENT_KEY) === "1");
    setReady(true);
  }, [initialName]);

  // Thumbnails are object URLs of the guest's own files: free them when the page goes.
  const urls = useRef<string[]>([]);

  // A task opened from the menu lower down the page: bring its sheet into view.
  useEffect(() => {
    if (view === "video" || view === "voice" || view === "wish") sheetRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [view]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const errorText = (code: string) => t(`errors.${(KNOWN_ERRORS as readonly string[]).includes(code) ? code : "generic"}`);
  // Photos still uploading count too, so a second pick cannot queue more than the shots left.
  const inFlight = queue.filter((item) => item.stage !== "done" && item.stage !== "failed").length;
  const shotsLeft = shots ? Math.max(0, shots.limit - usedShots - inFlight) : null;
  const outOfShots = shotsLeft === 0;

  async function submitPin(form: HTMLFormElement) {
    const pin = String(new FormData(form).get("pin") ?? "");
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/e/${slug}/pin`, { pin });
      setView(name && initialName ? "menu" : "name");
    } catch (e) {
      setError(e instanceof UploadError && e.code === "locked" ? t("pinLocked") : t("pinWrong"));
    } finally {
      setBusy(false);
    }
  }

  async function submitName(form: HTMLFormElement) {
    const displayName = String(new FormData(form).get("displayName") ?? "").trim();
    if (!displayName) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ displayName: string }>(`/api/e/${slug}/guest`, { displayName });
      setName(result.displayName);
      storageSet(NAME_KEY, result.displayName);
      setView("menu");
    } catch (e) {
      if (e instanceof UploadError && e.code === "pin_required") setView("pin");
      else setError(errorText(e instanceof UploadError ? e.code : "generic"));
    } finally {
      setBusy(false);
    }
  }

  function agree(value: boolean) {
    setConsent(value);
    if (value) storageSet(CONSENT_KEY, "1");
  }

  function update(id: number, patch: Partial<QueueItem>) {
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function runOne(item: QueueItem): Promise<boolean> {
    try {
      update(item.id, { stage: "compressing", error: undefined, progress: 0 });
      const blob = await compressImage(item.file);
      await uploadOne({
        slug,
        kind: "PHOTO",
        blob,
        onStage: (stage) => update(item.id, { stage }),
        onProgress: (progress) => update(item.id, { progress }),
      });
      setUsedShots((n) => n + 1);
      return true;
    } catch (e) {
      const code = e instanceof UploadError ? e.code : "generic";
      if (code === "shots_used_up" && shots) setUsedShots(shots.limit);
      update(item.id, { stage: "failed", error: errorText(code) });
      return false;
    }
  }

  async function runQueue(items: QueueItem[]) {
    let index = 0;
    const results: boolean[] = [];
    async function worker() {
      while (index < items.length) {
        const item = items[index++]!;
        results.push(await runOne(item));
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    if (results.length > 0 && results.every(Boolean)) setView("thanks");
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    // With a shot limit, send only as many as are left; the server checks again.
    const picked = Array.from(files);
    const allowed = shotsLeft === null ? picked : picked.slice(0, shotsLeft);
    setSkipped(picked.length - allowed.length);
    const items: QueueItem[] = allowed.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { id: nextId.current++, file, url, stage: "queued", progress: 0 };
    });
    setQueue((current) => [...current, ...items]);
    void runQueue(items);
  }

  async function submitWish(form: HTMLFormElement) {
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/e/${slug}/wishes`, { message });
      form.reset();
      setView("thanks");
    } catch (e) {
      setError(errorText(e instanceof UploadError ? e.code : "generic"));
    } finally {
      setBusy(false);
    }
  }

  const gold =
    "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--sk-gold)] px-6 text-lg font-semibold text-[var(--sk-ground-deep)] transition-colors hover:bg-[var(--sk-gold-light)] disabled:cursor-not-allowed disabled:opacity-50";
  const outline =
    "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--sk-gold)]/70 px-6 font-medium text-[var(--sk-ivory)] hover:bg-white/5";
  const field =
    "block min-h-14 w-full border-0 border-b-2 border-[var(--sk-gold)]/70 bg-transparent px-1 text-xl text-[var(--sk-ivory)] placeholder:text-[var(--sk-ivory)]/60 focus:border-[var(--sk-gold-light)] focus:outline-none";
  const errorBox = error ? (
    <p role="alert" className="mt-4 rounded-md bg-[#5c1410] px-4 py-3 text-[#ffd9d2]">
      {error}
    </p>
  ) : null;

  // The ivory "kad" that holds the longer tasks, like a card slipped into the hand.
  const sheet = (title: string, body: ReactNode) => (
    <section ref={sheetRef} className="sk-rise pb-paper mt-8 scroll-mt-4 rounded-[6px] p-5 text-[#2a211a] shadow-[0_24px_48px_-16px_rgb(0_0_0/0.6)]" style={paperVars}>
      <button type="button" onClick={() => setView("menu")} className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-[#5a4a3a]">
        <BackIcon />
        {t("back")}
      </button>
      <h2 className="sk-display mt-1 text-3xl">{title}</h2>
      {body}
    </section>
  );

  if (view === "pin") {
    return (
      <section className="sk-rise mt-10">
        <h2 className="sk-display text-center text-2xl">{t("pinTitle")}</h2>
        <form
          method="post"
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPin(e.currentTarget);
          }}
        >
          <label className="block">
            <span className="text-sm text-[var(--sk-ivory)]/85">{t("pinLabel")}</span>
            <input name="pin" inputMode="numeric" autoComplete="one-time-code" pattern="\d{4,8}" maxLength={8} required className={`${field} mt-1 text-center text-3xl tracking-[0.5em]`} />
          </label>
          <button type="submit" disabled={!ready || busy} className={gold}>
            {t("pinSubmit")}
          </button>
        </form>
        {errorBox}
      </section>
    );
  }

  if (view === "name") {
    return (
      <section className="sk-rise mt-10">
        <h2 className="sk-display text-center text-[1.75rem]">{t("nameTitle")}</h2>
        <p className="mt-2 text-center text-[var(--sk-ivory)]/80">{t("nameHelp")}</p>
        <form
          method="post"
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submitName(e.currentTarget);
          }}
        >
          <label className="block">
            <span className="sr-only">{t("nameLabel")}</span>
            <input name="displayName" defaultValue={name} key={name} required maxLength={40} autoComplete="name" placeholder={t("namePlaceholder")} className={`${field} text-center`} />
          </label>
          <button type="submit" disabled={!ready || busy} className={gold}>
            {t("nameSubmit")}
          </button>
        </form>
        {errorBox}
      </section>
    );
  }

  if (view === "thanks") {
    return (
      <section className="sk-rise mt-10 flex flex-col items-center text-center">
        <Bunga className="size-16 text-[var(--sk-gold)]" />
        <h2 className="sk-display mt-5 text-4xl">{t("thanksTitle")}</h2>
        <p className="mt-3 max-w-xs text-[var(--sk-ivory)]/85">{t("thanksBody")}</p>
        {processingNote ? <p className="mt-2 max-w-xs text-sm text-[var(--sk-ivory)]/75">{t("processingNote")}</p> : null}
        <div className="mt-8 w-full space-y-3">
          {galleryHref ? (
            <a href={galleryHref} className={gold}>
              {t("viewGallery")}
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setProcessingNote(false);
              setView("menu");
            }}
            className={outline}
          >
            {t("addMore")}
          </button>
        </div>
      </section>
    );
  }

  if (view === "video" || view === "voice") {
    const finish = () => {
      setProcessingNote(true);
      setView("thanks");
    };
    return sheet(
      view === "video" ? t("video") : t("voice"),
      view === "video" ? (
        <VideoPicker slug={slug} consent={consent} maxSeconds={features.maxVideoSeconds} onDone={finish} errorText={errorText} />
      ) : (
        <VoiceRecorder slug={slug} consent={consent} onDone={finish} errorText={errorText} />
      ),
    );
  }

  if (view === "wish") {
    return sheet(
      t("wish"),
      <>
        <form
          method="post"
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitWish(e.currentTarget);
          }}
        >
          <label className="block">
            <span className="text-sm font-medium">{t("wishLabel")}</span>
            <textarea
              name="message"
              required
              maxLength={1000}
              rows={5}
              placeholder={t("wishPlaceholder")}
              className="mt-2 block w-full rounded-[4px] border border-[#2a211a]/25 bg-white/60 p-4 text-lg placeholder:text-[#2a211a]/55 focus:border-[var(--sk-ground)]"
            />
          </label>
          <button
            type="submit"
            disabled={!ready || busy || !consent}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--sk-ground)] px-6 text-lg font-semibold text-[var(--sk-ivory)] disabled:opacity-50"
          >
            {busy ? t("sending") : t("wishSubmit")}
          </button>
        </form>
        {errorBox}
      </>,
    );
  }

  // Menu: the shutter first, then the other ways to share.
  const done = queue.filter((item) => item.stage === "done").length;
  const locked = !consent || !ready;
  const secondary = [
    { key: "video" as const, label: t("video"), icon: <VideoIcon />, enabled: features.video, note: features.video ? null : t("premiumOnly") },
    { key: "voice" as const, label: t("voice"), icon: <VoiceIcon />, enabled: features.voice, note: null },
    { key: "wish" as const, label: t("wish"), icon: <WishIcon />, enabled: true, note: null },
  ];

  return (
    <section className="sk-rise mt-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg">{t("hello", { name })}</p>
        <button type="button" onClick={() => setView("name")} className="min-h-11 px-1 text-sm text-[var(--sk-ivory)]/80 underline underline-offset-4">
          {t("changeName")}
        </button>
      </div>

      {consent ? (
        // Agreed: one quiet line that still shows the choice and can undo it.
        <div className="mt-4 flex flex-wrap items-center gap-x-4 text-sm text-[var(--sk-ivory)]/80">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => agree(e.target.checked)} className="size-4" />
            {t("consentAgree")}
          </label>
          <a href={privacyHref} className="inline-flex min-h-11 items-center underline underline-offset-4">
            {t("consentPrivacyLink")}
          </a>
        </div>
      ) : (
        <div className="pb-paper mt-6 rounded-[6px] p-5 text-[0.95rem] leading-relaxed text-[#2a211a]">
          <p>{t("consent")}</p>
          <a href={privacyHref} className="mt-1 inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            {t("consentPrivacyLink")}
          </a>
          <label className="mt-1 flex min-h-11 items-center gap-3 font-semibold">
            <input type="checkbox" checked={consent} onChange={(e) => agree(e.target.checked)} className="size-5 accent-[var(--sk-ground)]" />
            {t("consentAgree")}
          </label>
        </div>
      )}

      <div className="mt-7 flex flex-col items-center">
        <button
          type="button"
          disabled={locked || outOfShots}
          onClick={() => cameraInput.current?.click()}
          className="sk-shutter grid size-32 place-items-center rounded-full text-[var(--sk-ivory)] disabled:cursor-not-allowed"
          aria-describedby={shots ? "shots-line" : undefined}
        >
          <CameraIcon size={40} />
          <span className="sr-only">{outOfShots ? t("shotsOut") : t("shutter")}</span>
        </button>
        <p className="sk-display mt-4 text-2xl" aria-hidden>
          {outOfShots ? t("shotsOut") : t("shutter")}
        </p>
        {shots ? (
          <p id="shots-line" className="mt-1 text-sm text-[var(--sk-gold-light)] tabular-nums">
            {t("shotsLeft", { left: shotsLeft ?? 0, limit: shots.limit })}
          </p>
        ) : null}
        <button
          type="button"
          disabled={locked || outOfShots}
          onClick={() => galleryInput.current?.click()}
          className="mt-3 inline-flex min-h-11 items-center gap-2 px-3 font-medium text-[var(--sk-ivory)] underline decoration-[var(--sk-gold)] underline-offset-[6px] disabled:opacity-50"
        >
          <GalleryIcon />
          {t("fromGallery")}
        </button>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={locked || outOfShots}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="camera-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryInput}
          type="file"
          accept="image/*"
          multiple
          disabled={locked || outOfShots}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="photo-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {skipped > 0 ? (
          <p role="status" className="mt-3 text-center text-sm text-[#ffd9d2]">
            {t("shotsSkipped", { count: skipped })}
          </p>
        ) : null}
      </div>

      <div className="mt-10 grid grid-cols-3 divide-x divide-[var(--sk-gold)]/35 border-y border-[var(--sk-gold)]/35">
        {secondary.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={locked || !action.enabled}
            onClick={() => setView(action.key)}
            className="flex min-h-24 flex-col items-center justify-center gap-2 px-2 text-[var(--sk-ivory)] hover:bg-white/5 disabled:opacity-45"
          >
            <span className="text-[var(--sk-gold-light)]">{action.icon}</span>
            <span className="font-medium">{action.label}</span>
            {action.note ? <span className="-mt-1 text-xs text-[var(--sk-ivory)]/75">{action.note}</span> : null}
          </button>
        ))}
      </div>

      <MyPhotos
        photos={queue.map((item) => ({
          id: item.id,
          url: item.url,
          stage: item.stage,
          progress: item.progress,
          failed: item.stage === "failed",
          error: item.error,
        }))}
        title={t("myPhotos")}
        progressText={t("progress", { done, total: queue.length })}
        retryLabel={t("retry")}
        onRetry={(id) => {
          const item = queue.find((q) => q.id === id);
          if (item) void runQueue([item]);
        }}
      />

      {galleryHref ? (
        <a href={galleryHref} className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-[var(--sk-gold-light)] underline underline-offset-4">
          {t("viewGallery")}
        </a>
      ) : null}
    </section>
  );
}
