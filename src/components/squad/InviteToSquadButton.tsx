"use client";

import { Check, UserPlus } from "lucide-react";
import type { Profile } from "@/lib/types";
import { createSquad, inviteToSquad } from "@/lib/engine/actions";
import { getAttendee, getEvent, getProfile, isLobbyInteractive, squadMembers, squadOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { Button } from "@/components/ui/button";

/** "Invitar a mi Squad" desde el perfil de cualquier asistente o match. */
export function InviteToSquadButton({ target }: { target: Profile }) {
  const { state, run, notify } = useRouge();
  const meId = state.current_user_id;
  const eventId = state.active_event_id;
  const event = getEvent(state, eventId);
  if (!event || !isLobbyInteractive(event) || !getAttendee(state, eventId, meId) || !getAttendee(state, eventId, target.id)) return null;

  const mine = squadOf(state, eventId, meId);
  const membership = mine ? squadMembers(state, mine.squad.id, "any").find((m) => m.user_id === target.id) : undefined;
  const theirs = squadOf(state, eventId, target.id);
  const first = target.full_name.split(" ")[0];

  if (membership) {
    return (
      <Button block variant="glass" disabled className="text-squad">
        <Check /> {membership.status === "joined" ? `${first} está en tu Squad` : "Invitación al Squad enviada"}
      </Button>
    );
  }
  if (theirs && theirs.squad.id !== mine?.squad.id) {
    return <p className="text-center text-xs text-muted">{first} ya está en otro Squad esta noche.</p>;
  }

  const invite = () => {
    let squadId = mine?.squad.id;
    if (!squadId) {
      const me = getProfile(state, meId)!;
      const created = run((s) => createSquad(s, eventId, meId, `Squad de ${me.full_name.split(" ")[0]}`));
      if (!created.ok) return;
      squadId = created.data.id;
    }
    const r = run((s) => inviteToSquad(s, squadId!, meId, target.id));
    if (r.ok) notify({ tone: "squad", title: `👯 Invitaste a ${first} a tu Squad`, description: mine ? "Le llega la invitación al instante." : "Creamos tu Squad y le mandamos la invitación." });
  };

  return (
    <Button block variant="outline" className="border-squad/50 text-squad" onClick={invite}>
      <UserPlus /> Invitar a mi Squad
    </Button>
  );
}
