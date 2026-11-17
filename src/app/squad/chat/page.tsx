"use client";

import Link from "next/link";
import { useMemo } from "react";
import { UsersRound } from "lucide-react";
import { activeEvent, getProfile, squadMembers, squadOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { SquadChatPanel } from "@/components/squad/SquadChatPanel";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";

export default function SquadChatPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <SquadChat />;
}

function SquadChat() {
  const { state } = useRouge();
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const mine = squadOf(state, event.id, meId);
  const members = useMemo(() => (mine ? squadMembers(state, mine.squad.id).map((m) => getProfile(state, m.user_id)!).filter(Boolean) : []), [state, mine]);

  if (!mine) {
    return (
      <main>
        <PageHeader title="Chat del Squad" backHref="/squad" />
        <div className="flex flex-col items-center gap-3 px-8 pt-24 text-center">
          <UsersRound className="size-10 text-squad" />
          <h2 className="text-xl">Todavía no tenés Squad</h2>
          <Link href="/squad" className={buttonVariants({ variant: "squad" })}>
            Armar mi Squad
          </Link>
        </div>
      </main>
    );
  }
  const { squad } = mine;

  return (
    <main className="flex min-h-dvh flex-col">
      <PageHeader
        backHref="/squad"
        title={squad.name}
        subtitle={`${members.length} integrantes · solo ustedes ven este chat`}
        action={
          <div className="flex -space-x-2">
            {members.slice(0, 4).map((p) => (
              <Avatar key={p.id} profile={p} size={28} ring="squad" />
            ))}
          </div>
        }
      />
      <SquadChatPanel />
    </main>
  );
}
