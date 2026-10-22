import { useEffect, useId, useRef } from "react";
import type { SlideshowLayout, SlideshowOptions } from "./options";

export type SettingsLabels = {
  settings: string;
  close: string;
  layout: string;
  layoutSingle: string;
  layoutCollage: string;
  layoutFilm: string;
  layoutMosaic: string;
  frame: string;
  names: string;
  rail: string;
};

export function SettingsDialog({
  options,
  labels,
  onChange,
  onClose,
}: {
  options: SlideshowOptions;
  labels: SettingsLabels;
  onChange: (next: SlideshowOptions) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("input[type=radio]:checked")?.focus();
  }, []);

  // On the document, so Escape and Tab work wherever focus is (even after a click on plain text). Tab wraps inside the dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !panel.current) return;
      // A radio group is one tab stop: the checked radio.
      const stops = [...panel.current.querySelectorAll<HTMLElement>("input:not([type=radio]), input[type=radio]:checked, button")];
      if (stops.length === 0) return;
      event.preventDefault();
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = at === -1 ? (event.shiftKey ? stops.length - 1 : 0) : (at + step + stops.length) % stops.length;
      stops[next]?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const layouts: [SlideshowLayout, string][] = [
    ["single", labels.layoutSingle],
    ["collage", labels.layoutCollage],
    ["film", labels.layoutFilm],
    ["mosaic", labels.layoutMosaic],
  ];
  const checkboxes = [
    ["frame", labels.frame, options.frame === "print", (on: boolean): Partial<SlideshowOptions> => ({ frame: on ? "print" : "none" })],
    ["names", labels.names, options.names, (on: boolean) => ({ names: on })],
    ["rail", labels.rail, options.rail, (on: boolean) => ({ rail: on })],
  ] as const;

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4" style={{ cursor: "auto" }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md space-y-5 rounded-2xl bg-neutral-900 p-6 text-lg">
        <h2 id={titleId} className="text-2xl font-semibold">{labels.settings}</h2>
        <fieldset className="space-y-2">
          <legend className="mb-1 opacity-70">{labels.layout}</legend>
          {layouts.map(([value, label]) => (
            <label key={value} className="flex items-center gap-3">
              <input type="radio" name="layout" checked={options.layout === value} onChange={() => onChange({ ...options, layout: value })} className="size-5" />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          {checkboxes.map(([key, label, checked, patch]) => (
            <label key={key} className="flex items-center gap-3">
              <input type="checkbox" checked={checked} onChange={(e) => onChange({ ...options, ...patch(e.target.checked) })} className="size-5" />
              {label}
            </label>
          ))}
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-white px-5 py-2 font-medium text-black" style={{ cursor: "pointer" }}>
          {labels.close}
        </button>
      </div>
    </div>
  );
}
