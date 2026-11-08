"use client";
/* eslint-disable @next/next/no-img-element -- local object URLs of the guest's own photos */

import type { ReactNode } from "react";

// Stori guest UI pieces. Icons are drawn here in one stroke weight; no icon library on the guest route.

function Icon({ children, size = 26 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const CameraIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 8.5h3l1.6-2.3a1 1 0 0 1 .8-.4h5.2a1 1 0 0 1 .8.4L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.6" />
  </Icon>
);

export const VideoIcon = () => (
  <Icon>
    <rect x="3" y="6.5" width="12.5" height="11" rx="1.5" />
    <path d="m15.5 10.5 5-3v9l-5-3" />
  </Icon>
);

export const VoiceIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
  </Icon>
);

export const WishIcon = () => (
  <Icon>
    <path d="M16.5 3.8a2 2 0 0 1 2.8 2.8L8.5 17.4 4.5 18.5l1.1-4Z" />
    <path d="M14.5 5.8l2.8 2.8M4 21h16" />
  </Icon>
);

export const GalleryIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" />
  </Icon>
);

export const BackIcon = () => (
  <Icon size={20}>
    <path d="M15 5 8 12l7 7" />
  </Icon>
);

/** A tick in a ring, for the thank-you view. */
export const CheckIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="m7.8 12.4 2.9 2.9 5.6-6" />
  </Icon>
);

export type MyPhoto = { id: number; url: string; stage: string; progress: number; failed: boolean; error?: string };

/** The guest's own photos from this visit, with progress and retry. */
export function MyPhotos({
  photos,
  title,
  progressText,
  retryLabel,
  onRetry,
}: {
  photos: MyPhoto[];
  title: string;
  progressText: string;
  retryLabel: string;
  onRetry: (id: number) => void;
}) {
  if (photos.length === 0) return null;
  const failed = photos.filter((p) => p.failed);
  return (
    <section className="mt-6" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-brand">{title}</h2>
        <p className="text-sm text-muted tabular-nums" aria-live="polite">
          {progressText}
        </p>
      </div>
      <ul className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:thin]">
        {photos.map((photo) => (
          <li key={photo.id} className="relative size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-[var(--st-line)]">
            <img src={photo.url} alt="" className={`h-full w-full object-cover ${photo.stage === "done" ? "" : "opacity-60"}`} />
            {photo.failed ? (
              <span className="absolute inset-0 bg-black/55 ring-2 ring-inset ring-danger" aria-hidden />
            ) : photo.stage !== "done" ? (
              <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50" aria-hidden>
                <span className="block h-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(8, Math.round(photo.progress * 100))}%` }} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {failed.length > 0 ? (
        <div className="mt-2 space-y-1">
          {failed.map((photo) => (
            <p key={photo.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-danger">{photo.error}</span>
              <button type="button" onClick={() => onRetry(photo.id)} className="min-h-11 px-2 font-medium text-brand underline underline-offset-4">
                {retryLabel}
              </button>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
