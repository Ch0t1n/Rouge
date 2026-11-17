"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Check, MapPin, MessageCircle, RefreshCw, X } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { MEETING_STATUS_META, awaitsMe, displayStatus, meetingEnd, meetingPlace, meetingPoint, meetingsOf, otherOf, type MeetingLocation } from "@/lib/engine/meetings";
import { getEvent } from "@/lib/engine/selectors";
import { faceOf, proHeadline, verticalOf } from "@/lib/engine/verticals";
import { profileHref } from "@/lib/engine/privacy";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { LocationPicker } from "@/components/meetings/LocationPicker";
import { MeetingRequestSheet } from "@/components/meetings/MeetingRequestSheet";

type Tab = "respond" | "upcoming" | "sent" | "history";

export default function MeetingsPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Meetings />;
}

/** Mis reuniones / Agenda del evento activo: para responder, próximas, enviadas e historial. */
function Meetings() {
  const { state } = useRouge();
  const now = useNow(30_000);
  const meId = state.current_user_id;
  const eventId = state.active_event_id;
  const v = verticalOf(state, eventId);
  const all = useMemo(() => meetingsOf(state, meId, eventId), [state, meId, eventId]);
  const groups: Record<Tab, Meeting[]> = {
    respond: all.filter((m) => awaitsMe(m, meId)),
    upcoming: all.filter((m) => displayStatus(m, now) === "accepted"),
    sent: all.filter((m) => (m.status === "pending" || m.status === "rescheduled") && m.proposed_by === meId),
    history: all.filter((m) => ["completed", "declined", "cancelled"].includes(displayStatus(m, now))).reverse(),
  };
  const [tab, setTab] = useState<Tab>(groups.respond.length ? "respond" : "upcoming");
  const labels: Record<Tab, string> = { respond: "Para responder", upcoming: "Próximas", sent: "Enviadas", history: "Historial" };

  return (
    <main className="pb-12">
      <PageHeader title={v.kind === "corporate" ? "Mis reuniones" : "Puntos de encuentro"} subtitle={getEvent(state, eventId)?.name} backHref="/app" />
      <div className="no-scrollbar sticky top-0 z-20 -mt-1 flex gap-2 overflow-x-auto bg-background/85 px-4 pb-3 pt-1 backdrop-blur-xl" role="tablist">
        {(Object.keys(labels) as Tab[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("min-h-[40px] shrink-0 rounded-full border px-3.5 text-sm font-semibold transition", tab === k ? "border-squad bg-squad/15 text-primary" : "border-white/15 bg-white/[0.04] text-muted")}
          >
            {labels[k]} {groups[k].length ? `· ${groups[k].length}` : ""}
          </button>
        ))}
      </div>
      <div className="space-y-3 px-4">
        {groups[tab].length === 0 && (
          <p className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">
            {tab === "respond"
              ? "No tenés pedidos para responder."
              : tab === "upcoming"
                ? v.kind === "corporate"
                  ? "Todavía no confirmaste reuniones. Pedí una desde el perfil de alguien en Networking."
                  : "Todavía no tenés puntos de encuentro confirmados. Proponé uno desde el perfil de un match."
                : tab === "sent"
                  ? "No tenés pedidos esperando respuesta."
                  : "Sin reuniones anteriores."}
          </p>
        )}
        {groups[tab].map((m) => (
          <MeetingCard key={m.id} meeting={m} now={now} />
        ))}
      </div>
    </main>
  );
}

function MeetingCard({ meeting: m, now }: { meeting: Meeting; now: number }) {
  const { state, exec, notify } = useRouge();
  const meId = state.current_user_id;
  const other = faceOf(state, otherOf(m, meId), m.event_id);
  const st = displayStatus(m, now);
  const meta = MEETING_STATUS_META[st];
  const mine = awaitsMe(m, meId);
  const [reschedule, setReschedule] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [place, setPlace] = useState<MeetingLocation>({ kind: "tbd" });
  const point = meetingPoint(state, m);
  const live = st === "accepted" && +new Date(m.starts_at) <= now && meetingEnd(m) > now;
  if (!other) return null;
  const pro = other.persona?.kind === "corporate" ? other.persona : null;

  const respond = async (accept: boolean, location?: MeetingLocation) => {
    const r = await exec(C.respondMeeting(m.id, meId, accept, location));
    if (!r.ok) return;
    setPlaceOpen(false);
    notify(accept ? { tone: "squad", title: "📅 Reunión confirmada", description: "Se abrió el chat y el lugar quedó marcado en el plano." } : { tone: "info", title: "Reunión rechazada", description: "No le avisamos el motivo." });
  };
  const cancel = async () => {
    if (!window.confirm("¿Cancelar esta reunión? Le avisamos a la otra persona.")) return;
    const r = await exec(C.cancelMeeting(m.id, meId));
    if (r.ok) notify({ tone: "info", title: "Reunión cancelada" });
  };

  return (
    <article id={m.id} className={cn("glass space-y-3 rounded-3xl p-4", mine && "ring-1 ring-squad/50", live && "ring-1 ring-vip/60")}>
      <div className="flex items-start gap-3">
        <Link href={profileHref(other, m.event_id)}>
          <Avatar profile={other} size={48} ring={st === "accepted" ? "squad" : "none"} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold">{other.full_name}</p>
            <Badge tone={meta.tone === "muted" ? "neutral" : meta.tone}>{live ? "En curso" : meta.label}</Badge>
          </div>
          {pro && proHeadline(pro) && <p className="truncate text-xs text-muted">{proHeadline(pro)}</p>}
          <p className="mt-1.5 text-[15px] leading-snug">{m.topic}</p>
        </div>
      </div>
      <ul className="space-y-1 text-sm text-primary/90">
        <li className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted" /> {formatDateTime(m.starts_at)} · {m.duration_min} min
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="size-4 text-muted" /> {meetingPlace(state, m)}
          {point && (
            <Link href={`/map?meeting=${m.id}`} className="ml-auto text-xs font-semibold text-squad">
              Ver en el plano
            </Link>
          )}
        </li>
        {m.status === "rescheduled" && <li className="text-xs text-vip">{m.proposed_by === meId ? "Propusiste un cambio de horario o lugar." : "Te propusieron un cambio de horario o lugar."}</li>}
      </ul>

      {mine && (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Button onClick={() => (m.location_kind === "tbd" ? setPlaceOpen(true) : respond(true))}>
            <Check /> Aceptar
          </Button>
          <Button variant="glass" size="icon" aria-label="Proponer otro horario" title="Proponer otro horario" onClick={() => setReschedule(true)}>
            <RefreshCw />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Rechazar" title="Rechazar" onClick={() => respond(false)}>
            <X />
          </Button>
        </div>
      )}
      {st === "accepted" && (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          {m.connection_id ? (
            <Link href={`/chat/${m.connection_id}`} className={buttonVariants({ variant: "squad" })}>
              <MessageCircle /> Chat
            </Link>
          ) : (
            <span />
          )}
          <Button variant="glass" size="icon" aria-label="Reprogramar" title="Reprogramar" onClick={() => setReschedule(true)}>
            <RefreshCw />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Cancelar" title="Cancelar" onClick={cancel}>
            <X />
          </Button>
        </div>
      )}
      {!mine && (m.status === "pending" || m.status === "rescheduled") && (
        <Button variant="ghost" block onClick={cancel}>
          Cancelar pedido
        </Button>
      )}

      {reschedule && <MeetingRequestSheet open={reschedule} onClose={() => setReschedule(false)} eventId={m.event_id} target={other} meeting={m} />}
      <BottomSheet
        open={placeOpen}
        onClose={() => setPlaceOpen(false)}
        title="¿Dónde se encuentran?"
        description="El lugar quedó a definir: elegilo ahora o aceptá sin lugar y lo arreglan por chat."
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="glass" onClick={() => respond(true)}>
              Aceptar sin lugar
            </Button>
            <Button onClick={() => respond(true, place)} disabled={place.kind === "tbd"}>
              <Check /> Aceptar
            </Button>
          </div>
        }
      >
        <LocationPicker eventId={m.event_id} startsAt={m.starts_at} duration={m.duration_min} value={place} onChange={setPlace} excludeMeetingId={m.id} allowTbd={false} />
      </BottomSheet>
      {st === "accepted" && <p className="text-[11px] text-muted">Termina {formatTime(new Date(meetingEnd(m)).toISOString())}. Después pasa al historial como completada.</p>}
    </article>
  );
}
