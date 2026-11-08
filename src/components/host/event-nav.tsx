"use client";

import { Link, usePathname } from "@/i18n/navigation";

export function EventNav({ links }: { links: { href: string; label: string; external?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1" aria-label="Event">
      {links.map((link) => {
        const active = !link.external && pathname === link.href;
        const className = `inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium ${
          active ? "bg-ink text-on-ink" : "bg-surface text-ink/80 hover:bg-ink/5"
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