"use client";

/**
 * Agenda multi-track para asistentes (ROUGE Pro): filtros rápidos por Día, Sala y Track, el toggle "Ver solo Mi Agenda",
 * tarjetas con horario, duración, track, sala y oradores, ⭐ Agendar / Agendado ✓ con aviso de superposición y
 * "Ubicar sala en el mapa" (salta al pin de la sala en el plano indoor).
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Clock3, MapPin, MessageSquareText, Users } from "lucide-react";
import type { EventSession, RougeEvent } from "@/lib/types";
import { dayLabel, durationLabel, filterSessions, myAgendaIds, scheduleFacets, seatsLeft, sessionPhase, sessionsOf } from "@/lib/engine/schedule";
import { getAttendee } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { AgendaButton, LiveBadge, ProSurface, SpeakerList, TrackBadge, trackBarClass, useAgendaToggle } from "./scheduleUi";

/** Link al plano centrado en la sala (solo si la sala tiene un pin con posición). */
export function useRoomMapHref() {
  const { state } = useRouge();
  return (session: Pick<EventSession, "spot_id">) => {
    const spot = session.spot_id ? state.venue_spots.find((x) => x.id === session.spot_id && x.coord_x != null && x.coord_y != null) : undefined;
    return spot ? `/map?spot=${spot.id}` : null;
  };
}

function FilterChip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "min-h-[36px] shrink-0 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pro-sapphire",
        active ? "border-pro-cobalt bg-pro-cobalt text-white" : "border-pro-line bg-pro-slate text-pro-mist hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export function CorporateScheduleView({ event }: { event: RougeEvent }) {
  const { state } = useRouge();
  const now = useNow(30_000);
  const me = state.current_user_id;
  const attendee = getAttendee(state, event.id, me);
  const all = useMemo(() => sessionsOf(state, event.id), [state, event.id]);
  const facets = useMemo(() => scheduleFacets(all), [all]);
  const todayDefault = facets.days.find((d) => all.some((x) => x.day === d && sessionPhase(x, now) !== "past")) ?? facets.days[0] ?? null;
  const [day, setDay] = useState<string | null>(todayDefault);
  const [room, setRoom] = useState<string | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const { toggle, sheet } = useAgendaToggle();
  const mapHref = useRoomMapHref();

  const list = filterSessions(state, event.id, me, {
    day: facets.days.length > 1 ? day : null,
    room,
    track,
    mineOnly,
  });
  const mine = myAgendaIds(state, me, event.id);
  const live = all.filter((x) => x.is_live_now);
  // Grupos por franja de inicio ("14:30"), como una grilla de congreso: varias salas en paralelo.
  const groups = list.reduce<{ key: string; day: string; time: string; items: EventSession[] }[]>((acc, x) => {
    const key = `${x.day} ${x.start_time}`;
    const g = acc.at(-1);
    if (g && g.key === key) g.items.push(x);
    else acc.push({ key, day: x.day, time: x.start_time, items: [x] });
    return acc;
  }, []);

  return (
    <main>
      <ProSurface className="min-h-[80dvh] bg-pro-navy pb-10">
        {sheet}
        <header className="sticky top-0 z-30 border-b border-pro-line bg-pro-navy/90 px-4 pb-3 pt-4 backdrop-blur-xl">
          <p className="font-pro-mono text-[10px] uppercase tracking-[0.2em] text-pro-mist">
            ROUGE <span className="text-pro-gold">PRO</span> · {event.name}
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <h1 className="font-pro text-[26px] font-bold leading-tight tracking-[-0.02em]">Agenda</h1>
            <span className="pb-1 text-xs text-pro-mist" data-testid="agenda-count">
              {mine.size} en Mi Agenda · {all.length} charlas
            </span>
          </div>

          {/* Filtros rápidos */}
          <div className="mt-3 space-y-2">
            {facets.days.length > 1 && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Día">
                {facets.days.map((d) => (
                  <FilterChip key={d} active={day === d} onClick={() => setDay(d)}>
                    {dayLabel(d)}
                  </FilterChip>
                ))}
              </div>
            )}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Track">
              <FilterChip active={!track} onClick={() => setTrack(null)}>
                Todos los tracks
              </FilterChip>
              {facets.tracks.map((t) => (
                <FilterChip key={t} active={track === t} onClick={() => setTrack(track === t ? null : t)} testId={`filter-track-${t}`}>
                  {t}
                </FilterChip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Sala</span>
                <select
                  value={room ?? ""}
                  onChange={(e) => setRoom(e.target.value || null)}
                  className="min-h-[40px] w-full rounded-lg border border-pro-line bg-pro-slate px-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-pro-sapphire"
                  data-testid="filter-room"
                >
                  <option value="">Todas las salas</option>
                  {facets.rooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={mineOnly}
                onClick={() => setMineOnly(!mineOnly)}
                data-testid="filter-mine"
                className={cn(
                  "flex min-h-[40px] shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition",
                  mineOnly ? "border-pro-gold/50 bg-pro-gold/15 text-white" : "border-pro-line bg-pro-slate text-pro-mist hover:text-white",
                )}
              >
                <span className={cn("relative h-4 w-7 rounded-full transition", mineOnly ? "bg-pro-gold" : "bg-pro-panel")} aria-hidden>
                  <span className={cn("absolute top-0.5 size-3 rounded-full bg-white transition-all", mineOnly ? "left-3.5" : "left-0.5")} />
                </span>
                Ver solo Mi Agenda
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-5 px-4 pt-4">
          {!attendee && (
            <Link href={`/join/${event.slug}`} className="flex items-center justify-between gap-3 rounded-2xl border border-pro-sapphire/50 bg-pro-sapphire/10 p-4 text-sm">
              <span>
                <b className="block">Entrá al evento para armar tu agenda</b>
                <span className="text-pro-mist">Podés ver la agenda; para agendar y preguntar tenés que estar acreditado/a en la app.</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-pro-mist" />
            </Link>
          )}

          {live.length > 0 && !mineOnly && (
            <section aria-label="En vivo ahora" className="space-y-2">
              {live.map((x) => (
                <Link
                  key={x.id}
                  href={`/agenda/${x.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-pro-emerald/40 bg-pro-emerald/10 p-3 transition hover:bg-pro-emerald/15"
                  data-testid="live-now"
                >
                  <MessageSquareText className="size-5 shrink-0 text-pro-emerald" />
                  <span className="min-w-0 flex-1">
                    <LiveBadge />
                    <b className="mt-1 block truncate text-sm">{x.title}</b>
                    <span className="block truncate text-xs text-pro-mist">{x.room_name} · Preguntas y encuesta abiertas</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-pro-mist" />
                </Link>
              ))}
            </section>
          )}

          {groups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-pro-line p-6 text-center text-sm text-pro-mist" data-testid="agenda-empty">
              <CalendarDays className="mx-auto mb-2 size-8" />
              {all.length === 0
                ? "La organización todavía no publicó la agenda."
                : mineOnly
                  ? "Todavía no agendaste charlas para este filtro. Tocá ⭐ Agendar en las que te interesen."
                  : "No hay charlas con esos filtros."}
            </div>
          )}

          {groups.map((g, i) => (
            <section key={g.key} aria-label={`${g.time} hs`}>
              {(i === 0 || groups[i - 1].day !== g.day) && facets.days.length > 1 && !day && <h2 className="mb-2 font-pro text-sm font-semibold text-pro-mist">{dayLabel(g.day)}</h2>}
              <div className="mb-2 flex items-center gap-2">
                <span className="font-pro-mono text-sm font-semibold tabular-nums text-white">{g.time}</span>
                <span className="h-px flex-1 bg-pro-line" aria-hidden />
                {g.items.length > 1 && <span className="font-pro-mono text-[10px] uppercase tracking-[0.14em] text-pro-mist">{g.items.length} en paralelo</span>}
              </div>
              <ul className="space-y-2.5">
                {g.items.map((x) => (
                  <SessionCard key={x.id} session={x} tracks={facets.tracks} mine={mine.has(x.id)} now={now} onToggle={toggle} mapHref={mapHref(x)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </ProSurface>
    </main>
  );
}

function SessionCard({
  session: x,
  tracks,
  mine,
  now,
  onToggle,
  mapHref,
}: {
  session: EventSession;
  tracks: string[];
  mine: boolean;
  now: number;
  onToggle: (s: EventSession) => void;
  mapHref: string | null;
}) {
  const phase = sessionPhase(x, now);
  const left = seatsLeft(x);
  return (
    <li
      className={cn("relative overflow-hidden rounded-2xl border bg-pro-slate transition", mine ? "border-pro-emerald/50" : "border-pro-line", phase === "past" && "opacity-60")}
      data-testid={`session-${x.id}`}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", trackBarClass(tracks, x.track))} aria-hidden />
      <Link href={`/agenda/${x.id}`} className="block space-y-2.5 p-4 pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pro-sapphire">
        <div className="flex flex-wrap items-center gap-1.5">
          <TrackBadge tracks={tracks} track={x.track} />
          {x.is_live_now && <LiveBadge />}
          {!x.is_live_now && phase === "now" && <span className="rounded-md border border-pro-line px-2 py-0.5 font-pro-mono text-[10px] uppercase tracking-[0.12em] text-pro-mist">Ahora</span>}
          {phase === "past" && <span className="rounded-md border border-pro-line px-2 py-0.5 font-pro-mono text-[10px] uppercase tracking-[0.12em] text-pro-mist">Terminó</span>}
        </div>
        <h3 className="font-pro text-[16px] font-semibold leading-snug tracking-[-0.01em] text-white">{x.title}</h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-pro-mist">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock3 className="size-3.5" /> {x.start_time}–{x.end_time} · {durationLabel(x)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {x.room_name}
          </span>
          {left !== null && (
            <span className={cn("inline-flex items-center gap-1", left === 0 ? "text-pro-gold" : "")}>
              <Users className="size-3.5" /> {left === 0 ? "Sin lugares" : `${left} lugares`}
            </span>
          )}
        </p>
        <SpeakerList speakers={x.speakers} compact />
      </Link>
      <div className="flex flex-wrap items-center gap-2 border-t border-pro-line px-4 py-2.5 pl-5">
        <AgendaButton session={x} onToggle={onToggle} />
        {mapHref && (
          <Link
            href={mapHref}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-pro-mist transition hover:bg-pro-panel hover:text-white"
            data-testid={`locate-${x.id}`}
          >
            <MapPin className="size-4" /> Ubicar sala en el mapa
          </Link>
        )}
      </div>
    </li>
  );
}
