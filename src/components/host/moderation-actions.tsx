"use client";

import type { ModerationState } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { approveAllAction, moderateItemAction } from "@/server/moderation/actions";

export type ModerationLabels = { approve: string; hide: string; show: string; delete: string; confirmDelete: string };

export function ModerationActions({
  eventId,
  type,
  id,
  moderation,
  labels,
}: {
  eventId: string;
  type: "upload" | "wish";
  id: string;
  moderation: ModerationState;
  labels: ModerationLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: "approve" | "hide" | "show" | "delete") => {
    if (action === "delete" && !window.confirm(labels.confirmDelete)) return;
    startTransition(async () => {
      await moderateItemAction({ eventId, type, id, action });
      router.refresh();
    });
  };
  const button = "min-h-11 flex-1 rounded-full px-2 text-xs font-medium disabled:opacity-50";
  return (
    <div className="flex gap-1" aria-busy={pending}>
      {moderation === "PENDING_APPROVAL" ? (
        <button type="button" disabled={pending} onClick={() => run("approve")} className={`${button} bg-green-600 text-white`} /* stori-keep: green button */>
          {labels.approve}
        </button>
      ) : null}
      {moderation === "HIDDEN" ? (
        <button type="button" disabled={pending} onClick={() => run("show")} className={`${button} bg-cream`}>
          {labels.show}
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => run("hide")} className={`${button} bg-cream`}>
          {labels.hide}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => run("delete")} className={`${button} text-danger`}>
        {labels.delete}
      </button>
    </div>
  );
}

export function ApproveAllButton({ eventId, label }: { eventId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await approveAllAction(eventId);
          router.refresh();
        })
      }
      className="min-h-11 rounded-full bg-green-600 px-4 text-sm font-medium text-white disabled:opacity-50" /* stori-keep: green button */
    >
      {label}
    </button>
  );
}