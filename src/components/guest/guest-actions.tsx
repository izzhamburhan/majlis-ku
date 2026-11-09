"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackIcon, CameraIcon, CheckIcon, GalleryIcon, MyPhotos, VideoIcon, VoiceIcon, WishIcon } from "./guest-ui";
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
  const router = useRouter();
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
    if (view !== "video" && view !== "voice" && view !== "wish") return;
    // Reduced motion: jump, do not glide.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sheetRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
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
      // The server page left out the cover, gallery link, welcome text and counts until the PIN passed.
      router.refresh();
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

  const primary =
    "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-lg font-semibold text-on-brand transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50";
  const outline = "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--st-line)] px-6 font-medium text-ink hover:bg-[var(--st-surface-lift)]";
  const field =
    "block min-h-14 w-full rounded-2xl border border-[var(--st-line)] bg-[var(--st-ground-deep)] px-4 text-xl text-ink placeholder:text-muted focus:border-brand focus:outline-none";
  const panel = "rounded-3xl bg-surface p-5 ring-1 ring-[var(--st-line)]";
  const errorBox = error ? (
    <p role="alert" className="mt-4 rounded-2xl bg-[var(--st-ground-deep)] px-4 py-3 text-danger">
      {error}
    </p>
  ) : null;

  // The dusk sheet that holds the longer tasks. Ordinary page flow, not a dialog: the names above stay readable.
  const sheet = (title: string, body: ReactNode) => (
    <section ref={sheetRef} className={`${panel} mt-6 scroll-mt-4`}>
      <button type="button" onClick={() => setView("menu")} className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-muted">
        <BackIcon />
        {t("back")}
      </button>
      <h2 className="mt-1 font-serif text-3xl">{title}</h2>
      {body}
    </section>
  );

  if (view === "pin") {
    return (
      <section className={`${panel} mt-6`}>
        <h2 className="text-center font-serif text-2xl">{t("pinTitle")}</h2>
        <form
          method="post"
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPin(e.currentTarget);
          }}
        >
          <label className="block">
            <span className="text-sm text-muted">{t("pinLabel")}</span>
            <input name="pin" inputMode="numeric" autoComplete="one-time-code" pattern="\d{4,8}" maxLength={8} required className={`${field} mt-1 text-center text-3xl tracking-[0.5em]`} />
          </label>
          <button type="submit" disabled={!ready || busy} className={primary}>
            {t("pinSubmit")}
          </button>
        </form>
        {errorBox}
      </section>
    );
  }

  if (view === "name") {
    return (
      <section className={`${panel} mt-6`}>
        <h2 className="text-center font-serif text-[1.75rem]">{t("nameTitle")}</h2>
        <p className="mt-2 text-center text-muted">{t("nameHelp")}</p>
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
          <button type="submit" disabled={!ready || busy} className={primary}>
            {t("nameSubmit")}
          </button>
        </form>
        {errorBox}
      </section>
    );
  }

  if (view === "thanks") {
    return (
      <section className={`${panel} mt-6 flex flex-col items-center text-center`}>
        <span className="text-brand">
          <CheckIcon size={56} />
        </span>
        <h2 className="mt-4 font-serif text-4xl">{t("thanksTitle")}</h2>
        <p className="mt-3 max-w-xs text-muted">{t("thanksBody")}</p>
        {processingNote ? <p className="mt-2 max-w-xs text-sm text-muted">{t("processingNote")}</p> : null}
        <div className="mt-8 w-full space-y-3">
          {galleryHref ? (
            <a href={galleryHref} className={primary}>
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
              className="mt-2 block w-full rounded-2xl border border-[var(--st-line)] bg-[var(--st-ground-deep)] p-4 text-lg text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </label>
          <button type="submit" disabled={!ready || busy || !consent} className={primary}>
            {busy ? t("sending") : t("wishSubmit")}
          </button>
        </form>
        {errorBox}
      </>,
    );
  }

  // Menu: consent and shots in the page flow, the dock pinned to the bottom of the screen.
  const done = queue.filter((item) => item.stage === "done").length;
  const locked = !consent || !ready;
  const dockItem =
    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-center text-[0.8125rem] font-semibold leading-tight text-ink disabled:opacity-50";
  const secondary = [
    { key: "video" as const, label: t("video"), icon: <VideoIcon />, enabled: features.video, note: features.video ? null : t("premiumOnly") },
    { key: "voice" as const, label: t("voice"), icon: <VoiceIcon />, enabled: features.voice, note: null },
    { key: "wish" as const, label: t("wish"), icon: <WishIcon />, enabled: true, note: null },
  ];
  const dockButton = (action: (typeof secondary)[number]) => (
    <button key={action.key} type="button" disabled={locked || !action.enabled} onClick={() => setView(action.key)} className={dockItem}>
      {action.icon}
      <span>{action.label}</span>
      {action.note ? <span className="-mt-1 text-[0.6875rem] font-normal text-muted">{action.note}</span> : null}
    </button>
  );

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg">{t("hello", { name })}</p>
        <button type="button" onClick={() => setView("name")} className="min-h-11 px-1 text-sm text-muted underline underline-offset-4">
          {t("changeName")}
        </button>
      </div>

      {consent ? (
        // Agreed: one quiet line that still shows the choice and can undo it.
        <div className="flex flex-wrap items-center gap-x-4 text-sm text-muted">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => agree(e.target.checked)} className="size-4" />
            {t("consentAgree")}
          </label>
          <a href={privacyHref} className="inline-flex min-h-11 items-center underline underline-offset-4">
            {t("consentPrivacyLink")}
          </a>
        </div>
      ) : (
        <div className="mt-2 rounded-3xl bg-surface px-4 py-3 text-sm leading-relaxed ring-1 ring-[var(--st-line)]">
          <p>{t("consent")}</p>
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <input type="checkbox" checked={consent} onChange={(e) => agree(e.target.checked)} className="size-5" />
              {t("consentAgree")}
            </label>
            <a href={privacyHref} className="inline-flex min-h-11 items-center underline underline-offset-4">
              {t("consentPrivacyLink")}
            </a>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
        {shots ? (
          <p id="shots-line" className="rounded-full bg-surface px-3 py-1 text-sm font-semibold tabular-nums ring-1 ring-[var(--st-line)]">
            {t("shotsLeft", { left: shotsLeft ?? 0, limit: shots.limit })}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={locked || outOfShots}
          onClick={() => galleryInput.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink underline underline-offset-4 disabled:opacity-50"
        >
          <GalleryIcon />
          {t("fromGallery")}
        </button>
      </div>
      {outOfShots ? <p className="mt-1 text-sm font-semibold text-brand">{t("shotsOut")}</p> : null}
      {skipped > 0 ? (
        <p role="status" className="mt-2 text-sm text-danger">
          {t("shotsSkipped", { count: skipped })}
        </p>
      ) : null}
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

      {/* Keeps the last controls clear of the dock. */}
      <div aria-hidden className="h-[calc(8rem+env(safe-area-inset-bottom))]" />

      <nav
        aria-label={t("chooseAction")}
        data-testid="guest-dock"
        className="st-glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 mx-auto grid max-w-md grid-cols-5 items-center rounded-[2.5rem] px-1 py-1.5"
      >
        {galleryHref ? (
          <a href={galleryHref} className={dockItem}>
            <GalleryIcon size={26} />
            <span>{t("dockGallery")}</span>
          </a>
        ) : (
          <span aria-hidden />
        )}
        {dockButton(secondary[0]!)}
        <button
          type="button"
          disabled={locked || outOfShots}
          onClick={() => cameraInput.current?.click()}
          className="st-shutter mx-auto -mt-5 grid size-[4.5rem] place-items-center rounded-full bg-brand text-on-brand shadow-lg ring-4 ring-[var(--color-cream)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-describedby={shots ? "shots-line" : undefined}
          data-testid="guest-shutter"
        >
          <CameraIcon size={34} />
          <span className="sr-only">{outOfShots ? t("shotsOut") : t("shutter")}</span>
        </button>
        {dockButton(secondary[1]!)}
        {dockButton(secondary[2]!)}
      </nav>
    </section>
  );
}
