"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { UploadError, uploadOne, type Stage } from "./upload-client";

/** Reads a video's length in the browser, so too-long videos are refused before any upload. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    video.src = url;
  });
}

export default function VideoPicker({
  slug,
  consent,
  maxSeconds,
  onDone,
  errorText,
}: {
  slug: string;
  consent: boolean;
  maxSeconds: number;
  onDone: () => void;
  errorText: (code: string) => string;
}) {
  const t = useTranslations("guest");
  const [stage, setStage] = useState<Stage | "idle" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function send(picked: File) {
    setFile(picked);
    setError(null);
    setProgress(0);
    const duration = await readDuration(picked);
    if (duration !== null && duration > maxSeconds + 0.5) {
      setStage("failed");
      setError(t("videoTooLong", { seconds: Math.round(duration), max: maxSeconds }));
      return;
    }
    try {
      await uploadOne({
        slug,
        kind: "VIDEO",
        blob: picked,
        durationSec: duration === null ? null : Math.ceil(duration),
        onStage: setStage,
        onProgress: setProgress,
      });
      onDone();
    } catch (e) {
      setStage("failed");
      setError(errorText(e instanceof UploadError ? e.code : "generic"));
    }
  }

  const busy = stage !== "idle" && stage !== "failed" && stage !== "done";
  return (
    <div className="mt-4">
      <label
        className={`inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-brand px-6 text-lg font-medium text-on-brand ${
          consent && !busy ? "" : "pointer-events-none opacity-50"
        }`}
        aria-disabled={!consent || busy}
      >
        🎥 {t("videoPick")}
        <input
          type="file"
          accept="video/*"
          className="sr-only"
          disabled={!consent || busy}
          data-testid="video-input"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void send(picked);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-2 text-center text-sm text-muted">{t("videoHelp", { seconds: maxSeconds })}</p>
      {file && stage !== "idle" ? (
        <div className="mt-4 rounded-xl border border-ink/10 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{file.name}</span>
            <span className={stage === "failed" ? "text-danger" : "text-muted"}>{stage === "failed" ? t("failed") : t(stage)}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-full ${stage === "failed" ? "bg-danger" : "bg-brand"}`}
              style={{ width: `${stage === "processing" || stage === "done" ? 100 : Math.round(progress * 100)}%` }}
            />
          </div>
          {error ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span role="alert" className="text-danger">
                {error}
              </span>
              {file ? (
                <button type="button" onClick={() => void send(file)} className="min-h-11 px-3 font-medium underline">
                  {t("retry")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}