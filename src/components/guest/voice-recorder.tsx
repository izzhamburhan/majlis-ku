"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { pickRecorderMime } from "./recorder-mime";
import { UploadError, uploadOne, type Stage } from "./upload-client";

const MAX_SECONDS = 180;

type Recording = { blob: Blob; url: string; seconds: number };

export default function VoiceRecorder({
  slug,
  consent,
  onDone,
  errorText,
}: {
  slug: string;
  consent: boolean;
  onDone: () => void;
  errorText: (code: string) => string;
}) {
  const t = useTranslations("guest");
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Recording | null>(null);
  const [stage, setStage] = useState<Stage | "idle" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      pickRecorderMime((type) => MediaRecorder.isTypeSupported(type)) !== null;
    setSupported(ok);
    return () => {
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  }

  async function start() {
    setError(null);
    setResult(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError(t("voiceDenied"));
      return;
    }
    const mimeType = pickRecorderMime((type) => MediaRecorder.isTypeSupported(type)) ?? undefined;
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    rec.onstop = () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks.current, { type: (rec.mimeType || mimeType || "audio/webm").split(";")[0] });
      const seconds = (Date.now() - started.current) / 1000;
      setResult({ blob, url: URL.createObjectURL(blob), seconds });
    };
    recorder.current = rec;
    started.current = Date.now();
    rec.start(1000);
    setRecording(true);
    setElapsed(0);
    timer.current = setInterval(() => {
      const seconds = (Date.now() - started.current) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) stop();
    }, 250);
  }

  async function send(blob: Blob, seconds: number | null) {
    setError(null);
    setProgress(0);
    try {
      await uploadOne({
        slug,
        kind: "VOICE",
        blob,
        durationSec: seconds === null ? null : Math.ceil(seconds),
        onStage: setStage,
        onProgress: setProgress,
      });
      onDone();
    } catch (e) {
      setStage("failed");
      setError(errorText(e instanceof UploadError ? e.code : "generic"));
    }
  }

  const button = "min-h-12 w-full rounded-full px-6 text-lg font-medium disabled:opacity-50";
  const busy = stage !== "idle" && stage !== "failed" && stage !== "done";

  if (!supported) {
    return (
      <div className="mt-4">
        <p className="text-sm text-muted">{t("voiceNoMic")}</p>
        <label className={`${button} mt-3 inline-flex cursor-pointer items-center justify-center bg-brand text-on-brand ${consent && !busy ? "" : "pointer-events-none opacity-50"}`}>
          🎙️ {t("voicePick")}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            disabled={!consent || busy}
            data-testid="voice-input"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void send(picked, null);
              e.target.value = "";
            }}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {recording ? (
        <>
          <p className="text-center text-2xl font-medium tabular-nums" aria-live="polite">
            <span aria-hidden className="mr-2 inline-block size-3 animate-pulse rounded-full bg-danger" />
            {t("voiceRecording", { time: formatDuration(elapsed) })}
          </p>
          <button type="button" onClick={stop} className={`${button} bg-ink text-on-ink`}>
            ⏹ {t("voiceStop")}
          </button>
        </>
      ) : result ? (
        <>
          <audio controls src={result.url} className="w-full" />
          <button type="button" disabled={!consent || busy} onClick={() => void send(result.blob, result.seconds)} className={`${button} bg-brand text-on-brand`}>
            {busy ? t(stage as Stage) : t("voiceSend")}
          </button>
          <button type="button" disabled={busy} onClick={() => void start()} className={`${button} border border-ink/20`}>
            {t("voiceRedo")}
          </button>
          {busy ? (
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full bg-brand" style={{ width: `${stage === "processing" ? 100 : Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </>
      ) : (
        <button type="button" disabled={!consent} onClick={() => void start()} className={`${button} bg-brand text-on-brand`}>
          🎙️ {t("voiceStart")}
        </button>
      )}
      <p className="text-center text-sm text-muted">{t("voiceMax")}</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}