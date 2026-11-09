import { Link } from "@/i18n/navigation";
import type { GalleryFilter, GalleryQuery } from "@/server/gallery/service";

export type ToolbarLabels = Record<
  "filterAll" | "filterPhoto" | "filterVideo" | "filterVoice" | "filterWish" | "search" | "searchButton" | "sortNewest" | "sortOldest",
  string
>;

const FILTER_LABEL: Record<GalleryFilter, keyof ToolbarLabels> = {
  all: "filterAll",
  photo: "filterPhoto",
  video: "filterVideo",
  voice: "filterVoice",
  wish: "filterWish",
};

function href(base: string, query: Partial<GalleryQuery>): string {
  const params = new URLSearchParams();
  if (query.filter && query.filter !== "all") params.set("filter", query.filter);
  if (query.q) params.set("q", query.q);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.status && query.status !== "all") params.set("status", query.status);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Filters, search and sort as plain links and a GET form: works without client JavaScript. */
export function GalleryToolbar({
  base,
  query,
  labels,
  filters,
  formAction,
}: {
  base: string;
  /** The localized path for the GET form (Link localizes by itself; a form does not). */
  formAction: string;
  query: GalleryQuery;
  labels: ToolbarLabels;
  filters: readonly GalleryFilter[];
}) {
  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4">
        {filters.map((filter) => (
          <Link
            key={filter}
            href={href(base, { ...query, filter })}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium ${
              query.filter === filter ? "bg-brand text-on-brand" : "bg-surface text-muted"
            }`}
          >
            {labels[FILTER_LABEL[filter]]}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" action={formAction}>
        {query.filter !== "all" ? <input type="hidden" name="filter" value={query.filter} /> : null}
        {query.status !== "all" ? <input type="hidden" name="status" value={query.status} /> : null}
        <input
          name="q"
          defaultValue={query.q}
          placeholder={labels.search}
          aria-label={labels.search}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-ink/20 bg-surface px-4"
        />
        <select name="sort" defaultValue={query.sort} aria-label={labels.sortNewest} className="min-h-11 rounded-full border border-ink/20 bg-surface px-3">
          <option value="newest">{labels.sortNewest}</option>
          <option value="oldest">{labels.sortOldest}</option>
        </select>
        <button type="submit" className="min-h-11 rounded-full bg-ink px-4 text-sm font-medium text-on-ink">
          {labels.searchButton}
        </button>
      </form>
    </div>
  );
}

/** Links that keep the current query but change one field. */
export function galleryHref(base: string, query: GalleryQuery, change: Partial<GalleryQuery>): string {
  return href(base, { ...query, ...change });
}

export function nextPageHref(base: string, query: GalleryQuery, cursor: string): string {
  const url = href(base, query);
  return `${url}${url.includes("?") ? "&" : "?"}after=${encodeURIComponent(cursor)}`;
}