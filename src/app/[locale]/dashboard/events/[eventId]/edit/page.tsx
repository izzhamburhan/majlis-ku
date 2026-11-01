import { getTranslations, setRequestLocale } from "next-intl/server";
import { CoverUploader } from "@/components/host/cover-uploader";
import { DeleteEventForm } from "@/components/host/delete-event-form";
import { EventForm } from "@/components/host/event-form";
import { eventFormLabels, settingsLabels } from "@/components/host/labels";
import { MembersPanel } from "@/components/host/members-panel";
import { SettingsForm } from "@/components/host/settings-form";
import type { Locale } from "@/i18n/routing";
import { utcToKlLocal } from "@/lib/dates";
import { requireEventMember } from "@/server/events/access";
import { updateEventAction, updateSettingsAction } from "@/server/events/actions";
import { listMembers } from "@/server/events/members";
import { MEDIA_URL_TTL_SEC, storage } from "@/server/media/storage";
import { deleteEventAction, inviteCohostAction, removeCohostAction } from "@/server/moderation/actions";
import { canDeleteEvent, canEditEvent, canManageMembers } from "@/server/moderation/rules";

export default async function EditEventPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const { event } = await requireEventMember(locale as Locale, eventId);
  const [t, ts, tm, td, formLabels, setLabels, members] = await Promise.all([
    getTranslations("eventForm"),
    getTranslations("eventSettings"),
    getTranslations("members"),
    getTranslations("danger"),
    eventFormLabels("save"),
    settingsLabels(),
    listMembers(event.id),
  ]);
  const coverUrl = event.coverKey ? await storage().getDownloadUrl(event.coverKey, { expiresInSec: MEDIA_URL_TTL_SEC }) : null;

  const canEdit = canEditEvent(event); // admins who are not members see the members list only

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      {canEdit ? (
      <section className="rounded-2xl bg-white/60 p-5">
        <h2 className="mb-4 font-serif text-2xl">{t("editTitle")}</h2>
        <EventForm
          action={updateEventAction.bind(null, locale as Locale, event.id)}
          labels={formLabels}
          defaults={{
            type: event.type,
            title: event.title,
            hostNames: event.hostNames,
            startsAtLocal: utcToKlLocal(event.startsAt),
            venueName: event.venueName ?? "",
            venueAddress: event.venueAddress ?? "",
            googleMapsUrl: event.googleMapsUrl ?? "",
            wazeUrl: event.wazeUrl ?? "",
            welcomeText: event.welcomeText ?? "",
            themeColor: event.themeColor,
          }}
        />
      </section>
      ) : null}
      <div className="space-y-6">
        {canEdit ? (
        <>
        <section className="rounded-2xl bg-white/60 p-5">
          <CoverUploader
            eventId={event.id}
            coverUrl={coverUrl}
            labels={{
              cover: ts("cover"),
              upload: ts("coverUpload"),
              uploading: ts("coverUploading"),
              remove: ts("coverRemove"),
              error: ts("coverError"),
            }}
          />
        </section>
        <section className="rounded-2xl bg-white/60 p-5">
          <h2 className="mb-4 font-serif text-2xl">{ts("title")}</h2>
          <SettingsForm
            action={updateSettingsAction.bind(null, locale as Locale, event.id)}
            labels={setLabels}
            defaults={{ galleryVisibility: event.galleryVisibility, requireApproval: event.requireApproval, hasPin: Boolean(event.pinHash), shotsPerGuest: event.shotsPerGuest }}
          />
        </section>
        </>
        ) : null}
        <section className="rounded-2xl bg-white/60 p-5">
          <MembersPanel
            members={members.map((m) => ({ userId: m.userId, email: m.user.email, role: m.role }))}
            canManage={canManageMembers(event.memberRole)}
            inviteAction={inviteCohostAction.bind(null, event.id)}
            removeAction={removeCohostAction.bind(null, event.id)}
            labels={{
              title: tm("title"),
              help: tm("help"),
              owner: tm("owner"),
              cohost: tm("cohost"),
              email: tm("email"),
              invite: tm("invite"),
              invited: tm("invited"),
              remove: tm("remove"),
              invalid_email: tm("invalid_email"),
              already_member: tm("already_member"),
              forbidden: tm("forbidden"),
            }}
          />
        </section>
        {canDeleteEvent(event.memberRole) ? (
          <DeleteEventForm
            action={deleteEventAction.bind(null, locale as Locale, event.id)}
            slug={event.slug}
            labels={{
              title: td("title"),
              body: td("body"),
              confirmLabel: td("confirmLabel", { slug: event.slug }),
              button: td("button"),
              confirm: td("confirm"),
              has_payments: td("has_payments"),
              forbidden: td("forbidden"),
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
