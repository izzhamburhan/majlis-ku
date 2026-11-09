"use client";

import { useActionState, useTransition } from "react";
import type { MemberFormState } from "@/server/moderation/actions";

type Member = { userId: string; email: string; role: "OWNER" | "COHOST" };

export type MembersLabels = Record<
  "title" | "help" | "owner" | "cohost" | "email" | "invite" | "invited" | "remove" | "invalid_email" | "already_member" | "forbidden",
  string
>;

export function MembersPanel({
  members,
  canManage,
  inviteAction,
  removeAction,
  labels,
}: {
  members: Member[];
  canManage: boolean;
  inviteAction: (state: MemberFormState, formData: FormData) => Promise<MemberFormState>;
  removeAction: (userId: string) => Promise<void>;
  labels: MembersLabels;
}) {
  const [state, formAction, inviting] = useActionState(inviteAction, {});
  const [removing, startTransition] = useTransition();
  return (
    <div>
      <h2 className="font-serif text-2xl">{labels.title}</h2>
      <p className="mt-1 text-sm text-muted">{labels.help}</p>
      <ul className="mt-3 divide-y divide-[var(--st-line)] rounded-xl bg-surface" data-testid="members">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-2 p-3 text-sm">
            <span className="min-w-0 truncate">{member.email}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-cream px-2 py-1 text-xs">{member.role === "OWNER" ? labels.owner : labels.cohost}</span>
              {canManage && member.role === "COHOST" ? (
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => startTransition(() => removeAction(member.userId))}
                  className="min-h-11 px-2 text-danger underline"
                >
                  {labels.remove}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form action={formAction} className="mt-3 flex gap-2">
          <input
            type="email"
            name="email"
            required
            placeholder={labels.email}
            aria-label={labels.email}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-[var(--st-line)] bg-[var(--st-ground-deep)] px-4"
          />
          <button type="submit" disabled={inviting} className="min-h-11 rounded-full bg-ink px-4 text-sm font-medium text-on-ink">
            {labels.invite}
          </button>
        </form>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {labels[state.error]}
        </p>
      ) : state.saved ? (
        <p role="status" className="mt-2 text-sm text-success">
          {labels.invited}
        </p>
      ) : null}
    </div>
  );
}