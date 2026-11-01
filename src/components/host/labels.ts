import "server-only";
import { getTranslations } from "next-intl/server";
import type { GalleryLabels } from "@/components/gallery/gallery-grid";
import type { ToolbarLabels } from "@/components/gallery/gallery-toolbar";
import { EVENT_TYPES } from "@/lib/schemas/event";
import type { EventFormLabels } from "./event-form";
import type { SettingsLabels } from "./settings-form";

export async function eventFormLabels(mode: "create" | "save"): Promise<EventFormLabels> {
  const [t, types, common] = await Promise.all([getTranslations("eventForm"), getTranslations("eventTypes"), getTranslations("common")]);
  return {
    type: t("type"),
    title: t("title"),
    titlePlaceholder: t("titlePlaceholder"),
    hostNames: t("hostNames"),
    hostNamesPlaceholder: t("hostNamesPlaceholder"),
    startsAt: t("startsAt"),
    venueName: t("venueName"),
    venueAddress: t("venueAddress"),
    googleMapsUrl: t("googleMapsUrl"),
    wazeUrl: t("wazeUrl"),
    welcomeText: t("welcomeText"),
    welcomePlaceholder: t("welcomePlaceholder"),
    themeColor: t("themeColor"),
    submit: mode === "create" ? t("create") : t("save"),
    invalid: t("invalid"),
    saved: common("saved"),
    optional: common("optional"),
    types: Object.fromEntries(EVENT_TYPES.map((type) => [type, types(type)])),
  };
}

export async function settingsLabels(): Promise<SettingsLabels> {
  const [t, common, form] = await Promise.all([getTranslations("eventSettings"), getTranslations("common"), getTranslations("eventForm")]);
  return {
    visibility: t("visibility"),
    private: t("private"),
    guests: t("guests"),
    approval: t("approval"),
    approvalHelp: t("approvalHelp"),
    shots: t("shots"),
    shotsHelp: t("shotsHelp"),
    shotsUnlimited: t("shotsUnlimited"),
    pin: t("pin"),
    pinHelp: t("pinHelp"),
    pinSet: t("pinSet"),
    removePin: t("removePin"),
    save: t("save"),
    saved: common("saved"),
    invalid: form("invalid"),
  };
}

export async function galleryLabels(): Promise<GalleryLabels & ToolbarLabels> {
  const t = await getTranslations("gallery");
  return {
    by: t("by", { name: "{name}" }),
    pending: t("pending"),
    hidden: t("hidden"),
    original: t("original"),
    voiceNote: t("voiceNote"),
    empty: t("empty"),
    filterAll: t("filterAll"),
    filterPhoto: t("filterPhoto"),
    filterVideo: t("filterVideo"),
    filterVoice: t("filterVoice"),
    filterWish: t("filterWish"),
    search: t("search"),
    searchButton: t("searchButton"),
    sortNewest: t("sortNewest"),
    sortOldest: t("sortOldest"),
  };
}