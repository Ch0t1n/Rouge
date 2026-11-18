"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo } from "react";
import { Flag, Siren, UsersRound } from "lucide-react";
import { announceBaseMeetup, sendMessage } from "@/lib/engine/actions";
import { activeEvent, getProfile, squadMembers, squadMessages, squadOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { faceOf } from "@/lib/engine/verticals";

export default function SquadChatPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <SquadChat />;
}

function SquadChat() {
  const { state, exec } = useRouge();
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const mine = squadOf(state, event.id, meId);
  const members = useMemo(() => (mine ? squadMembers(state, mine.squad.id).map((m) => faceOf(state, m.user_id)!).filter(Boolean) : []), [state, mine]);
  const profiles = useMemo(() => new Map(members.map((p) => [p.id, p])), [members]);

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
      <div className="flex-1 px-3 pb-3 pt-1">
        <MessageList messages={squadMessages(state, squad.id)} meId={meId} profiles={profiles} group />
      </div>
      <div className="sticky bottom-0 z-20">
      <div className="no-scrollbar flex gap-2 overflow-x-auto bg-gradient-to-t from-background to-transparent px-3 pb-2 pt-3">
        {squad.base_pin_x != null && (
          <button type="button" onClick={() => exec(C.announceBaseMeetup(squad.id, meId, 10))} className="glass-pill inline-flex min-h-[36px] shrink-0 items-center gap-1.5 text-vip">
            <Flag className="size-3.5" /> Nos vemos en el Punto Base en 10′
          </button>
        )}
        <Link href="/squad" className="glass-pill inline-flex min-h-[36px] shrink-0 items-center gap-1.5 text-rouge">
          <Siren className="size-3.5" /> Rescate
        </Link>
        <Link href="/map" className="glass-pill inline-flex min-h-[36px] shrink-0 items-center gap-1.5 text-squad">
          📍 Ver plano
        </Link>
      </div>
      <Composer placeholder="Escribile al Squad…" onSend={async (body) => (await exec(C.sendMessage(meId, { type: "squad", squadId: squad.id }, body))).ok} />
      </div>
    </main>
  );
}
