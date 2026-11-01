"use client";
/* eslint-disable @next/next/no-img-element -- local object URLs of the guest's own photos */

import type { ReactNode } from "react";

// Songket guest UI pieces. Icons are drawn here in one stroke weight; no icon library on the guest route.

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

export const GalleryIcon = () => (
  <Icon size={20}>
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

/** Bunga cengkih: the eight-point clove flower woven into songket. */
export function Bunga({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g fill="currentColor">
        <path d="M32 2 38 26 62 32 38 38 32 62 26 38 2 32 26 26Z" opacity=".9" />
        <path d="M32 12 35.5 28.5 52 32 35.5 35.5 32 52 28.5 35.5 12 32 28.5 28.5Z" transform="rotate(45 32 32)" opacity=".55" />
      </g>
      <circle cx="32" cy="32" r="4.5" fill="var(--sk-ground)" />
    </svg>
  );
}

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
    <section className="mt-10" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="sk-display text-xl text-[var(--sk-gold-light)]">{title}</h2>
        <p className="text-sm text-[var(--sk-ivory)]/75 tabular-nums" aria-live="polite">
          {progressText}
        </p>
      </div>
      <ul className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:thin]">
        {photos.map((photo) => (
          <li key={photo.id} className="relative size-16 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-[var(--sk-gold)]/40">
            <img src={photo.url} alt="" className={`h-full w-full object-cover ${photo.stage === "done" ? "" : "opacity-60"}`} />
            {photo.failed ? (
              <span className="absolute inset-0 bg-red-900/55" aria-hidden />
            ) : photo.stage !== "done" ? (
              <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40" aria-hidden>
                <span className="block h-full bg-[var(--sk-gold-light)] transition-[width] duration-300" style={{ width: `${Math.max(8, Math.round(photo.progress * 100))}%` }} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {failed.length > 0 ? (
        <div className="mt-2 space-y-1">
          {failed.map((photo) => (
            <p key={photo.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[#ffb4a8]">{photo.error}</span>
              <button type="button" onClick={() => onRetry(photo.id)} className="min-h-11 px-2 font-medium text-[var(--sk-gold-light)] underline underline-offset-4">
                {retryLabel}
              </button>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
