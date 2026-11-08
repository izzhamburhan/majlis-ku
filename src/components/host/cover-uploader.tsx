"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CoverUploader({
  eventId,
  coverUrl,
  labels,
}: {
  eventId: string;
  coverUrl: string | null;
  labels: { cover: string; upload: string; uploading: string; remove: string; error: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function send(method: "POST" | "DELETE", file?: File) {
    setBusy(true);
    setError(false);
    const body = file ? new FormData() : undefined;
    if (file && body) body.set("file", file);
    const response = await fetch(`/api/events/${eventId}/cover`, { method, body }).catch(() => null);
    setBusy(false);
    if (!response?.ok) setError(true);
    else router.refresh();
  }

  return (
    <div>
      <p className="text-sm font-medium">{labels.cover}</p>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL; next/image would cache it
        <img src={coverUrl} alt="" className="mt-2 aspect-[16/9] w-full max-w-md rounded-2xl object-cover" />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ink/20 bg-surface px-4 text-sm font-medium">
          {busy ? labels.uploading : labels.upload}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send("POST", file);
              e.target.value = "";
            }}
          />
        </label>
        {coverUrl ? (
          <button type="button" disabled={busy} onClick={() => void send("DELETE")} className="min-h-11 px-3 text-sm text-ink/70 underline">
            {labels.remove}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {labels.error}
        </p>
      ) : null}
    </div>
  );
}