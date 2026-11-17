"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CalendarCheck } from "lucide-react";
import type { Profile } from "@/lib/types";
import { MEETING_STATUS_META, displayStatus, meetingEligibility, meetingPlace, meetingsOf } from "@/lib/engine/meetings";
import { verticalOf } from "@/lib/engine/verticals";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { formatTime } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { MeetingRequestSheet } from "./MeetingRequestSheet";

/**
 * "Solicitar reunión" (corporativo) / "Punto de encuentro" (noche, solo matches) desde el perfil de otra persona.
 * Si ya hay una reunión activa entre los dos, la muestra con link a Mis reuniones. El botón explica por qué está
 * deshabilitado ANTES de que la persona complete nada (meetingEligibility).
 */
export function MeetingButton({ target }: { target: Pick<Profile, "id" | "full_name" | "photos"> }) {
  const { state } = useRouge();
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const me = state.current_user_id;
  const eventId = state.active_event_id;
  const v = verticalOf(state, eventId);
  const pro = v.kind === "corporate";
  const active = meetingsOf(state, me, eventId).find(
    (m) => (m.requester_id === target.id || m.invitee_id === target.id) && ["pending", "rescheduled", "accepted"].includes(displayStatus(m, now)),
  );

  if (active) {
    const st = displayStatus(active, now);
    return (
      <Link href={`/meetings#${active.id}`} className={buttonVariants({ variant: "glass", block: true, size: "lg" })}>
        <CalendarCheck className="text-squad" /> {MEETING_STATUS_META[st].label} · {formatTime(active.starts_at)} · {meetingPlace(state, active)}
      </Link>
    );
  }

  const why = meetingEligibility(state, eventId, me, target.id, now);
  // En la noche, sin match no se ofrece (no es un hueco para escribirle a desconocidos).
  if (!pro && why && !state.connections.some((c) => c.event_id === eventId && c.status === "accepted" && [c.sender_id, c.receiver_id].includes(target.id) && [c.sender_id, c.receiver_id].includes(me))) return null;

  return (
    <>
      <Button block size="lg" variant="outline" className="border-squad/50 text-squad" disabled={!!why} title={why ?? undefined} onClick={() => setOpen(true)}>
        <CalendarClock /> {pro ? "Solicitar reunión" : "Punto de encuentro"}
      </Button>
      {why && <p className="text-center text-xs text-muted">{why}</p>}
      {open && <MeetingRequestSheet open={open} onClose={() => setOpen(false)} eventId={eventId} target={target} />}
    </>
  );
}
