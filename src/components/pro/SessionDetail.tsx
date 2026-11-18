"use client";

/** Detalle de una charla (ROUGE Pro): datos, oradores, ⭐ Agendar, "Ubicar sala en el mapa" y la sala en vivo (Q&A y encuestas). */
import Link from "next/link";
import { ArrowLeft, Clock3, MapPin, Users } from "lucide-react";
import type { UUID } from "@/lib/types";
import { dayLabel, durationLabel, getSession, scheduleFacets, seatsLeft, sessionPhase, sessionsOf } from "@/lib/engine/schedule";
import { getEvent } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { AgendaButton, LiveBadge, ProSurface, SpeakerList, TrackBadge, useAgendaToggle } from "./scheduleUi";
import { useRoomMapHref } from "./CorporateScheduleView";
import { SessionLiveInteraction } from "./SessionLiveInteraction";

export function SessionDetail({ sessionId }: { sessionId: UUID }) {
  const { state, can } = useRouge();
  const now = useNow(30_000);
  const { toggle, sheet } = useAgendaToggle();
  const mapHref = useRoomMapHref();
  const session = getSession(state, sessionId);
  const event = getEvent(state, session?.event_id);

  if (!session || !event) {
    return (
      <ProSurface className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 bg-pro-navy px-8 text-center">
        <h1 className="font-pro text-xl font-bold">Esa charla ya no está en la agenda</h1>
        <Link href="/agenda" className="text-sm font-semibold text-pro-sapphire underline-offset-4 hover:underline">
          Volver a la agenda
        </Link>
      </ProSurface>
    );
  }

  const tracks = scheduleFacets(sessionsOf(state, event.id)).tracks;
  const phase = sessionPhase(session, now);
  const left = seatsLeft(session);
  const href = mapHref(session);
  // Moderación: dueño/a y producción del evento de la charla.
  const moderator = state.active_event_id === event.id && can("admin.events");

  return (
    <main>
      <ProSurface className="min-h-[80dvh] bg-pro-navy pb-10">
        {sheet}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-pro-line bg-pro-navy/90 px-2 py-2 backdrop-blur-xl">
          <Link href="/agenda" className="grid size-11 place-items-center rounded-xl text-pro-mist hover:bg-pro-panel hover:text-white" aria-label="Volver a la agenda">
            <ArrowLeft className="size-5" />
          </Link>
          <p className="min-w-0 truncate font-pro-mono text-[10px] uppercase tracking-[0.2em] text-pro-mist">Agenda · {event.name}</p>
        </header>

        <div className="space-y-5 px-4 pt-4">
          <section className="space-y-3 rounded-3xl border border-pro-line bg-pro-slate p-5" data-testid="session-detail">
            <div className="flex flex-wrap items-center gap-1.5">
              <TrackBadge tracks={tracks} track={session.track} />
              {session.is_live_now && <LiveBadge />}
              {phase === "past" && <span className="rounded-md border border-pro-line px-2 py-0.5 font-pro-mono text-[10px] uppercase tracking-[0.12em] text-pro-mist">Terminó</span>}
            </div>
            <h1 className="font-pro text-[22px] font-bold leading-tight tracking-[-0.02em]">{session.title}</h1>
            <ul className="space-y-1 text-sm text-pro-mist">
              <li className="flex items-center gap-2 tabular-nums">
                <Clock3 className="size-4" /> {dayLabel(session.day)} · {session.start_time}–{session.end_time} · {durationLabel(session)}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="size-4" /> {session.room_name}
              </li>
              {left !== null && (
                <li className="flex items-center gap-2">
                  <Users className="size-4" /> {left === 0 ? "Sin lugares para agendar" : `${left} de ${session.capacity} lugares`}
                </li>
              )}
            </ul>
            {session.description && <p className="text-sm leading-relaxed text-pro-alabaster/90">{session.description}</p>}
            {session.speakers.length > 0 && (
              <div className="border-t border-pro-line pt-3">
                <p className="mb-2 font-pro-mono text-[10px] uppercase tracking-[0.16em] text-pro-mist">{session.speakers.length === 1 ? "Orador/a" : "Oradores"}</p>
                <SpeakerList speakers={session.speakers} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <AgendaButton session={session} onToggle={toggle} block />
              {href ? (
                <Link
                  href={href}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-pro-line bg-pro-navy/40 px-3 text-xs font-semibold text-pro-alabaster transition hover:bg-pro-panel"
                  data-testid="locate-room"
                >
                  <MapPin className="size-4" /> Ubicar sala en el mapa
                </Link>
              ) : (
                <span className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-dashed border-pro-line px-3 text-center text-[11px] text-pro-mist">
                  Sala sin pin en el plano
                </span>
              )}
            </div>
          </section>

          <SessionLiveInteraction sessionId={session.id} moderator={moderator} />
        </div>
      </ProSurface>
    </main>
  );
}
