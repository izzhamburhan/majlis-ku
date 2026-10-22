/* eslint-disable @next/next/no-img-element -- signed, short-lived media URLs */
import type { ReactNode } from "react";

/** Size limits for a photo or video. In a print frame the limit is the stage (a size container) minus the frame, so the frame hugs the media. */
export const mediaFit = (print: boolean) =>
  print ? "max-h-[calc(100cqh-6rem)] max-w-[calc(100cqw-2rem)]" : "min-h-0 max-h-full max-w-full";

/** A white border with a deeper bottom margin that carries the guest name, like a printed photo. */
export function Framed({ print, name, small, children }: { print: boolean; name: string | null; small?: boolean; children: ReactNode }) {
  if (!print) return children;
  if (small) {
    // A tile: the frame fills its cell and the child fills the frame.
    return (
      <figure className="flex h-full w-full flex-col bg-white p-1.5 text-black shadow-lg">
        <div className="min-h-0 flex-1">{children}</div>
        <figcaption className="h-6 truncate pt-1 text-center font-serif text-sm">{name}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="flex w-fit flex-col bg-white p-4 pb-3 text-black shadow-2xl">
      {children}
      <figcaption className="mt-3 h-14 w-0 min-w-full truncate pt-2 text-center font-serif text-3xl">{name}</figcaption>
    </figure>
  );
}

export function Photo({ src, print, name }: { src: string; print: boolean; name: string | null }) {
  return (
    <Framed print={print} name={name}>
      <img src={src} alt="" decoding="async" className={`${mediaFit(print)} object-contain`} />
    </Framed>
  );
}
