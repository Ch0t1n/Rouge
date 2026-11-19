"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo } from "react";
import { Flag, Siren } from "lucide-react";
import { activeEvent, getProfile, squadMembers, squadMessages, squadOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";

/** Mensajes + atajos (Punto Base, Rescate, plano) + composer del chat del Squad. Lo usan /squad/chat y la columna derecha de /squad en PC. */
export function SquadChatPanel() {
  const { state, exec } = useRouge();
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const mine = squadOf(state, event.id, meId);
  const members = useMemo(() => (mine ? squadMembers(state, mine.squad.id).map((m) => getProfile(state, m.user_id)!).filter(Boolean) : []), [state, mine]);
  const profiles = useMemo(() => new Map(members.map((p) => [p.id, p])), [members]);
  if (!mine) return null;
  const { squad } = mine;
  return (
    <>
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
    </>
  );
}
