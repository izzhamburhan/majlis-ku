"use client";
/* eslint-disable @next/next/no-img-element -- signed, short-lived media URLs */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bunga } from "@/components/guest/guest-ui";
import type { GalleryItem } from "@/server/gallery/items";
import { buildSpreads, composePage, nextSpread, promote, spreadKey, startBook, type BookPhoto, type BookState, type Page } from "./photobook";

const SPREAD_MS = 9000;
const TURN_MS = 1400;

export type PhotobookLabels = { scan: string; qrAlt: string; empty: string; from: string; fromAnon: string };

/** Small, stable tilt per spread, so a print sits a little differently on every page, like one placed by hand. */
function tilt(key: string, spread: number, salt: number): number {
  let h = salt;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (((h % 1000) / 1000) * 2 - 1) * spread;
}

/** Strip of songket tape holding a print or a card onto the page. */
function Tape({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={`pb-tape ${className}`} style={style} />;
}

function Photo({ photo, className = "" }: { photo: BookPhoto; className?: string }) {
  return <img src={photo.src} alt="" decoding="async" className={`block h-full w-full object-cover ${className}`} />;
}

/** Left page: the guest's photo mounted on the page, or their monogram when they sent only a wish. */
function LeftPage({ page, caption, dateLabel, names, folio }: { page: Page; caption: string; dateLabel: string; names: boolean; folio: number }) {
  const first = page.photos[0];
  const portrait = first?.portrait ?? false;
  return (
    <div className="relative flex h-full items-center justify-center">
      {/* A pressed bunga, dried into the corner of the page. */}
      <Bunga className="pb-pressed absolute top-[6%] left-[7%] size-[11cqh]" />

      {page.frame === "monogram" ? (
        <div className="pb-gilt w-[52%]" style={{ rotate: `${tilt(page.key, 1.5, 7)}deg` }}>
          <div className="pb-mat">
            <div className="songket flex aspect-[3/4] items-center justify-center">
              {names ? (
                <span className="sk-display text-[16cqh] leading-none text-[var(--sk-gold-light)]">{page.guestName.trim().charAt(0).toUpperCase()}</span>
              ) : (
                <Bunga className="size-[45%] text-[var(--sk-gold-light)]" />
              )}
            </div>
          </div>
        </div>
      ) : page.frame === "strip" ? (
        <figure className="pb-print relative -mt-[3%] flex h-[78%] flex-col gap-[1.3cqh] p-[1.3cqh] pb-0" style={{ rotate: `${tilt(page.key, 3, 11)}deg` }}>
          <Tape className="-top-[2.2cqh] left-1/2 -translate-x-1/2 -rotate-3" />
          {page.photos.map((photo) => (
            <div key={photo.id} className="aspect-[4/3] w-[31cqh] min-h-0 flex-1 overflow-hidden">
              <Photo photo={photo} />
            </div>
          ))}
          <figcaption className="sk-display py-[1.8cqh] text-center text-[1.6cqh] tracking-[0.22em] text-[#5a4a3a] uppercase">{caption}</figcaption>
        </figure>
      ) : page.mount === "gilded" ? (
        <figure className={`pb-gilt ${portrait ? "w-[56%]" : "w-[74%]"}`} style={{ rotate: `${tilt(page.key, 1.2, 3)}deg` }}>
          <div className="pb-mat">
            <div className={`${portrait ? "aspect-[3/4]" : "aspect-[4/3]"} overflow-hidden`}>
              <Photo photo={first!} />
            </div>
          </div>
        </figure>
      ) : (
        <figure className={`pb-print relative p-[2cqh] pb-0 ${portrait ? "w-[54%]" : "w-[70%]"}`} style={{ rotate: `${tilt(page.key, 3.5, 5)}deg` }}>
          <Tape className="-top-[2.4cqh] -left-[2cqh] -rotate-[28deg]" />
          <Tape className="-right-[2cqh] -bottom-[1.6cqh] -rotate-[24deg]" />
          <div className={`${portrait ? "aspect-[3/4]" : "aspect-[4/3]"} overflow-hidden`}>
            <Photo photo={first!} />
          </div>
          <figcaption className="sk-pen py-[2.4cqh] text-center text-[3.8cqh] leading-none text-[#4a3b2c]">{dateLabel}</figcaption>
        </figure>
      )}

      <span className="pb-folio absolute bottom-[4%] left-1/2 -translate-x-1/2">{folio}</span>
    </div>
  );
}

// Wishes run to 1000 characters: step the hand down by length; only the very longest end in an ellipsis.
function wishSize(length: number) {
  if (length > 420) return "text-[3.4cqh] line-clamp-[15]";
  if (length > 160) return "text-[4.6cqh] line-clamp-[10]";
  return "text-[6.2cqh] line-clamp-[7]";
}

/** Right page: the wish written on a note card taped into the book, signed, with the event's stamp. */
function RightPage({ page, names, from, fromAnon, dateLabel, folio }: { page: Page; names: boolean; from: string; fromAnon: string; dateLabel: string; folio: number }) {
  return (
    <div className="relative flex h-full items-center justify-center">
      <div className="pb-note relative w-[74%] px-[7%] pt-[8cqh] pb-[6cqh]" style={{ rotate: `${tilt(page.key, 2, 13)}deg` }}>
        <Tape className="-top-[2.2cqh] left-1/2 -translate-x-1/2 rotate-2" />
        {page.wish ? (
          <>
            <p className={`sk-pen leading-[1.32] text-[var(--sk-ink)] ${wishSize(page.wish.length)}`} style={{ textWrap: "pretty" }}>
              {page.wish}
            </p>
            {names ? <p className="sk-pen mt-[3cqh] text-right text-[4.6cqh] leading-none text-[#5d4a38]">— {page.guestName}</p> : null}
          </>
        ) : (
          <p className="sk-pen py-[4cqh] text-center text-[5.4cqh] leading-tight text-[var(--sk-ink)]">{names ? from.replace("{name}", page.guestName) : fromAnon}</p>
        )}
        {/* The cop: a gold stamp with the clove flower and the date, pressed at the corner of the card. */}
        <div className="pb-cop absolute -right-[4cqh] -bottom-[5cqh]" aria-hidden>
          <Bunga className="size-[5.5cqh] text-[var(--sk-gold)]" />
          <span className="sk-display mt-[0.4cqh] text-[1.3cqh] tracking-[0.16em] uppercase">{dateLabel}</span>
        </div>
      </div>
      <span className="pb-folio absolute bottom-[4%] left-1/2 -translate-x-1/2">{folio}</span>
    </div>
  );
}

type PageProps = { caption: string; names: boolean; from: string; fromAnon: string; dateLabel: string };

function LeftSheet({ page, folio, ...p }: PageProps & { page: Page; folio: number }) {
  return (
    <div className="pb-paper pb-left absolute inset-y-0 left-0 w-1/2 [container-type:size]">
      <LeftPage page={page} caption={p.caption} dateLabel={p.dateLabel} names={p.names} folio={folio} />
    </div>
  );
}

function RightSheet({ page, folio, ...p }: PageProps & { page: Page; folio: number }) {
  return (
    <div className="pb-paper pb-right absolute inset-y-0 right-0 w-1/2 [container-type:size]">
      <RightPage page={page} names={p.names} from={p.from} fromAnon={p.fromAnon} dateLabel={p.dateLabel} folio={folio} />
    </div>
  );
}

export function PhotobookView({
  items,
  hostNames,
  dateLabel,
  names,
  reduced,
  qrSrc,
  shareUrl,
  labels,
}: {
  items: GalleryItem[];
  hostNames: string;
  dateLabel: string;
  names: boolean;
  reduced: boolean;
  qrSrc: string;
  shareUrl: string;
  labels: PhotobookLabels;
}) {
  const spreads = useMemo(() => buildSpreads(items), [items]);
  const keys = useMemo(() => spreads.map((s) => s.key), [spreads]);
  const book = useRef<BookState>(startBook());
  const seen = useRef<Set<string> | null>(null);
  const [current, setCurrent] = useState<Page | null>(null);
  const [previous, setPrevious] = useState<Page | null>(null);
  const [turn, setTurn] = useState(0);
  const caption = `${hostNames} · ${dateLabel}`;
  const sheet: PageProps = { caption, names, from: labels.from, fromAnon: labels.fromAnon, dateLabel };

  // A guest who just posted gets the next spread.
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    for (const item of items) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      book.current = promote(book.current, spreadKey(item));
    }
  }, [items]);

  // Latest spreads by key, read inside the timer without restarting it.
  const latest = useRef({ spreads, keys });
  latest.current = { spreads, keys };
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const currentRef = useRef<Page | null>(null);
  const [turning, setTurning] = useState(false);

  useEffect(() => {
    function show() {
      const { spreads: all, keys: present } = latest.current;
      const step = nextSpread(book.current, present, Math.random);
      book.current = step.state;
      const spread = all.find((s) => s.key === step.key);
      const page = spread ? composePage(spread, Math.random) : null;
      for (const photo of page?.photos ?? []) new Image().src = photo.src;
      setPrevious(currentRef.current);
      setTurning(!reducedRef.current && currentRef.current !== null && page !== null);
      currentRef.current = page;
      setCurrent(page);
      setTurn((t) => t + 1);
    }
    show();
    const timer = setInterval(show, SPREAD_MS);
    return () => clearInterval(timer);
  }, []);

  // The host hid or deleted something on the page now showing: take it off the screen at once, without a turn.
  useEffect(() => {
    const shown = currentRef.current;
    if (!shown) return;
    const spread = spreads.find((s) => s.key === shown.key);
    const ids = new Set(spread?.photos.map((p) => p.id));
    const stale = !spread || shown.photos.some((p) => !ids.has(p.id)) || (shown.wish !== null && !spread.wishes.some((w) => w.message === shown.wish));
    if (!stale) return;
    const page = spread ? composePage(spread, Math.random) : null;
    currentRef.current = page;
    setPrevious(null);
    setTurning(false);
    setCurrent(page);
  }, [spreads]);

  // When the book was empty and the first memory arrives, open it straight away (no turn).
  useEffect(() => {
    if (currentRef.current !== null || keys.length === 0) return;
    const step = nextSpread(book.current, keys, Math.random);
    book.current = step.state;
    const spread = spreads.find((s) => s.key === step.key);
    if (!spread) return;
    const page = composePage(spread, Math.random);
    currentRef.current = page;
    setCurrent(page);
  }, [keys, spreads]);

  // The leaf is removed when the turn is over, leaving the new spread underneath. With reduced motion there is no leaf.
  useEffect(() => {
    if (!turning) return;
    const timer = setTimeout(() => setTurning(false), reduced ? 0 : TURN_MS);
    return () => clearTimeout(timer);
  }, [turning, turn, reduced]);

  // Page numbers run on like a real album: each turn moves two pages on.
  const folio = (n: number) => ({ left: n * 2, right: n * 2 + 1 });
  const now = folio(Math.max(turn, 1));
  const before = folio(Math.max(turn - 1, 1));

  return (
    <div data-testid="photobook" className="songket absolute inset-0 flex flex-col">
      <div className="sk-band sk-band-lg shrink-0" aria-hidden />
      <header className="flex shrink-0 items-baseline justify-between px-12 pt-5">
        <p className="sk-display text-4xl text-[var(--sk-gold-light)]">{hostNames}</p>
        <p className="sk-display text-xl tracking-[0.2em] text-[var(--sk-ivory)]/75 uppercase">{dateLabel}</p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-16 pt-4 pb-10">
        {current === null ? (
          <div className="flex flex-col items-center gap-8 text-center">
            <p className="sk-display max-w-3xl text-5xl leading-tight text-[var(--sk-ivory)]">{labels.empty}</p>
            <img src={qrSrc} alt={labels.qrAlt} className="size-72 rounded-xl bg-white p-3" />
            <p className="text-2xl text-[var(--sk-ivory)]/80">{shareUrl.replace(/^https?:\/\//, "")}</p>
          </div>
        ) : (
          // The album: a songket-bound hard cover with gold corner guards, the page block on top of it.
          <div className="pb-cover relative aspect-[16/10.4] h-full max-h-full max-w-full">
            <span className="pb-guard top-0 left-0" />
            <span className="pb-guard top-0 right-0 rotate-90" />
            <span className="pb-guard right-0 bottom-0 rotate-180" />
            <span className="pb-guard bottom-0 left-0 -rotate-90" />

            <div className="pb-block absolute inset-[3.2%_3%_4.2%_3%]" style={{ perspective: "2800px" }}>
              {/* Under the leaf: the old left page and the new right page; after the turn, the new spread. */}
              <div key={`base-${turn}`} className={reduced && previous ? "pb-fade absolute inset-0" : "absolute inset-0"}>
                {turning && previous ? (
                  <>
                    <LeftSheet page={previous} folio={before.left} {...sheet} />
                    <RightSheet page={current} folio={now.right} {...sheet} />
                    <div className="pb-cast pointer-events-none absolute inset-y-0 left-0 z-[5] w-1/2" aria-hidden />
                  </>
                ) : (
                  <>
                    <LeftSheet page={current} folio={now.left} {...sheet} />
                    <RightSheet page={current} folio={now.right} {...sheet} />
                  </>
                )}
              </div>

              {turning && previous ? (
                <div key={`leaf-${turn}`} className="pb-leaf absolute inset-y-0 right-0 z-10 w-1/2">
                  <div className="pb-face pb-paper pb-right absolute inset-0 [container-type:size]">
                    <RightPage page={previous} names={names} from={labels.from} fromAnon={labels.fromAnon} dateLabel={dateLabel} folio={before.right} />
                    <div className="pb-shade pb-shade-front" aria-hidden />
                  </div>
                  <div className="pb-face pb-back pb-paper pb-left absolute inset-0 [container-type:size]">
                    <LeftPage page={current} caption={caption} dateLabel={dateLabel} names={names} folio={now.left} />
                    <div className="pb-shade pb-shade-back" aria-hidden />
                  </div>
                </div>
              ) : null}

              {/* The gutter: pages curve into the binding, held by gold thread. */}
              <div className="pb-gutter pointer-events-none absolute inset-y-0 left-1/2 z-20 -translate-x-1/2" aria-hidden />
            </div>

            {/* Ribbon bookmark from the head of the spine. */}
            <span className="pb-ribbon" aria-hidden />
          </div>
        )}
      </div>

      {/* The upload QR waits in the margin beside the book, like a card left on the table. */}
      {current !== null ? (
        <aside className="pointer-events-none absolute right-8 bottom-12 flex w-44 flex-col items-center gap-3 text-center">
          <img src={qrSrc} alt={labels.qrAlt} className="size-36 rounded-lg bg-white p-1.5 shadow-[0_12px_24px_-8px_rgb(0_0_0/0.6)]" />
          <p className="text-base leading-snug text-[var(--sk-ivory)]">{labels.scan}</p>
        </aside>
      ) : null}
      <div className="sk-band sk-band-lg shrink-0 rotate-180" aria-hidden />
    </div>
  );
}
