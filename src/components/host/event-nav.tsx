"use client";

import { Link, usePathname } from "@/i18n/navigation";

/** The event's sections as a pill bar: the current page is a filled peach pill, the rest sit on the dusk bar. */
export function EventNav({ links }: { links: { href: string; label: string; external?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1 ring-1 ring-[var(--st-line)] [scrollbar-width:none]"
      aria-label="Event"
    >
      {links.map((link) => {
        const active = !link.external && pathname === link.href;
        const className = `inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
          active ? "bg-brand text-on-brand" : "text-ink hover:bg-[var(--st-surface-lift)]"
        }`;
        return link.external ? (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className={className}>
            {link.label} ↗
          </a>
        ) : (
          <Link key={link.href} href={link.href} className={className} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
