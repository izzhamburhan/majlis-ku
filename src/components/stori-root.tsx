import type { ReactNode } from "react";
import { STORI, storiVars } from "@/lib/stori";

/**
 * The Stori theme scope. Sets the dusk ground on html and body (so overscroll is dusk too) and wraps
 * the page in `.stori`, which overrides the colour tokens. Server Component: no client JS.
 * Pages that render this must not be wrapped by anything that already sets the page background.
 */
export function StoriRoot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <>
      <style>{`html,body{background:${STORI.ground}}`}</style>
      <div data-stori className={`stori min-h-dvh ${className}`.trim()} style={storiVars()}>
        {children}
      </div>
    </>
  );
}
