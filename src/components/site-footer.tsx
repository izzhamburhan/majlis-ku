import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Server component (no client JavaScript): links to the legal pages. `color` matches a card template with its own palette. */
export async function SiteFooter({ color }: { color?: string }) {
  const t = await getTranslations("legal.footer");
  const link = "inline-flex min-h-11 items-center px-3 text-sm text-muted underline";
  return (
    <footer className="mx-auto flex w-full max-w-5xl justify-center gap-2 px-4 py-4">
      <nav aria-label={t("nav")} className="flex gap-2">
        <Link href="/privacy" className={link} style={{ color }}>
          {t("privacy")}
        </Link>
        <Link href="/terms" className={link} style={{ color }}>
          {t("terms")}
        </Link>
      </nav>
    </footer>
  );
}
