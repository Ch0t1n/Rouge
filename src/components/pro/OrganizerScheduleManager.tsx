"use client";

/**
 * "Agenda & Charlas" del panel del organizador (eventos corporativos, ROUGE Pro): crear, editar y borrar charlas con
 * sala (vinculada a un pin del plano indoor), track, horario, cupo y oradores; "Activar En Vivo" por charla y
 * moderación de Q&A / encuestas en el mismo lugar. Solo dueño/a y producción (permiso admin.events).
 */
import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { CalendarDays, Clock3, MapPin, MessageSquareText, Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import type { EventSession, RougeEvent, UUID } from "@/lib/types";
import {
  dayLabel,
  durationLabel,
  eventDays,
  localParts,
  scheduleFacets,
  SESSION_DESCRIPTION_MAX,
  SESSION_ROOM_MAX,
  SESSION_SPEAKERS_MAX,
  SESSION_TITLE_MAX,
  SESSION_TRACK_MAX,
  sessionsOf,
  SPEAKER_FIELD_MAX,
  type SessionInput,
  type SpeakerInput,
} from "@/lib/engine/schedule";
import { faceOf, hasFeature } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { LiveBadge, ProButton, ProSurface, SpeakerList, TrackBadge, trackBarClass } from "./scheduleUi";
import { LiveControl, SessionLiveInteraction } from "./SessionLiveInteraction";

const TRACK_SUGGESTIONS = ["Tecnología & IA", "Negocios & Finanzas", "Liderazgo", "Marketing & Ventas", "Sustentabilidad"];

type Draft = Omit<SessionInput, "speakers" | "capacity"> & { speakers: SpeakerInput[]; capacity: string };

const input = "min-h-[44px] w-full rounded-xl border border-pro-line bg-pro-navy px-3 text-sm text-white placeholder:text-pro-mist/70 focus:outline-none focus:ring-2 focus:ring-pro-sapphire";
const label = "mb-1 block font-pro-mono text-[10px] uppercase tracking-[0.14em] text-pro-mist";

export function OrganizerScheduleManager({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const sessions = sessionsOf(state, event.id);
  const facets = scheduleFacets(sessions);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [moderating, setModerating] = useState<UUID | null>(null);
  const days = useMemo(() => eventDays(event), [event]);

  if (!hasFeature(state, event.id, "agenda")) {
    return (
      <ProSurface className="rounded-3xl border border-pro-line bg-pro-slate p-6 text-sm text-pro-mist">
        La agenda multi-track con Q&A y encuestas es para eventos corporativos (ROUGE Pro). Elegí un evento 💼 en el selector.
      </ProSurface>
    );
  }

  const blank = (): Draft => {
    const start = localParts(Math.max(Date.now(), +new Date(event.starts_at)));
    const day = days.includes(start.day) ? start.day : days[0];
    const h = Math.min(22, Number(start.time.slice(0, 2)) + 1);
    return { title: "", description: "", track: facets.tracks[0] ?? TRACK_SUGGESTIONS[0], room_name: "", spot_id: null, day, start_time: `${String(h).padStart(2, "0")}:00`, end_time: `${String(h).padStart(2, "0")}:45`, speakers: [], capacity: "" };
  };
  const edit = (x: EventSession): Draft => ({ ...x, capacity: x.capacity === null ? "" : String(x.capacity), speakers: x.speakers.map((sp) => ({ ...sp })) });

  const save = async () => {
    if (!draft) return;
    const cap = draft.capacity.trim() === "" ? null : Number(draft.capacity);
    const r = await exec(C.upsertSession(event.id, { ...draft, capacity: cap, speakers: draft.speakers }));
    if (!r.ok) return;
    notify({ tone: "squad", title: draft.id ? "Charla actualizada" : "Charla agregada a la agenda", description: `${r.data.title} · ${r.data.start_time} hs · ${r.data.room_name}` });
    setDraft(null);
  };
  const remove = async (x: EventSession) => {
    if (!window.confirm(`¿Borrar «${x.title}»? Se borran también sus preguntas, encuestas y las agendas de ${x.enrolled_count} personas.`)) return;
    const r = await exec(C.deleteSession(event.id, x.id));
    if (r.ok) notify({ tone: "info", title: "Charla borrada", description: x.title });
  };

  const byDay = days.map((d) => ({ day: d, items: sessions.filter((x) => x.day === d) })).filter((g) => g.items.length);

  return (
    <ProSurface className="space-y-4" >
      <section className="overflow-hidden rounded-3xl border border-pro-line bg-pro-slate shadow-2xl" data-testid="schedule-manager">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-pro-line bg-pro-navy/70 px-5 py-4">
          <div>
            <p className="font-pro-mono text-[10px] uppercase tracking-[0.2em] text-pro-mist">
              ROUGE <span className="text-pro-gold">PRO</span> · Agenda & Charlas
            </p>
            <h2 className="mt-0.5 font-pro text-xl font-bold tracking-[-0.02em]">{sessions.length} charlas · {facets.rooms.length} salas · {facets.tracks.length} tracks</h2>
          </div>
          {!draft && (
            <ProButton tone="primary" onClick={() => setDraft(blank())} data-testid="session-new">
              <Plus /> Nueva charla
            </ProButton>
          )}
        </header>

        {draft && <SessionForm event={event} draft={draft} setDraft={setDraft} days={days} tracks={facets.tracks} onSave={save} />}

        <div className="space-y-5 p-5">
          {sessions.length === 0 && !draft && <p className="text-sm text-pro-mist">Todavía no hay charlas. Cargá la primera con su sala, track y oradores: el público la ve al instante en su agenda.</p>}
          {byDay.map((g) => (
            <div key={g.day}>
              <h3 className="mb-2 flex items-center gap-2 font-pro text-sm font-semibold text-pro-mist">
                <CalendarDays className="size-4" /> {dayLabel(g.day)}
              </h3>
              <ul className="space-y-2">
                {g.items.map((x) => (
                  <li key={x.id} className="relative overflow-hidden rounded-2xl border border-pro-line bg-pro-navy/60" data-testid={`admin-session-${x.id}`}>
                    <span className={cn("absolute inset-y-0 left-0 w-1", trackBarClass(facets.tracks, x.track))} aria-hidden />
                    <div className="flex flex-col gap-3 p-4 pl-5 lg:flex-row lg:items-start">
                      <div className="w-24 shrink-0 font-pro-mono text-sm font-semibold tabular-nums text-white">
                        {x.start_time}–{x.end_time}
                        <span className="block text-[10px] font-normal text-pro-mist">{durationLabel(x)}</span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <TrackBadge tracks={facets.tracks} track={x.track} />
                          {x.is_live_now && <LiveBadge />}
                        </div>
                        <p className="font-semibold leading-snug text-white">{x.title}</p>
                        <p className="flex flex-wrap gap-x-3 text-xs text-pro-mist">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" /> {x.room_name}
                            {x.spot_id ? " · pin en el plano" : ""}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3.5" /> {x.enrolled_count}
                            {x.capacity !== null ? ` / ${x.capacity}` : ""} agendados
                          </span>
                        </p>
                        <SpeakerList speakers={x.speakers} compact />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                        <LiveControl sessionId={x.id} compact />
                        <ProButton size="sm" tone={moderating === x.id ? "success" : "outline"} onClick={() => setModerating(moderating === x.id ? null : x.id)} data-testid={`moderate-open-${x.id}`}>
                          <MessageSquareText /> Moderar
                        </ProButton>
                        <ProButton size="sm" tone="ghost" onClick={() => setDraft(edit(x))} aria-label={`Editar ${x.title}`}>
                          <Pencil />
                        </ProButton>
                        <ProButton size="sm" tone="ghost" onClick={() => remove(x)} aria-label={`Borrar ${x.title}`}>
                          <Trash2 />
                        </ProButton>
                      </div>
                    </div>
                    {moderating === x.id && (
                      <div className="border-t border-pro-line bg-pro-slate p-4">
                        <SessionLiveInteraction sessionId={x.id} moderator />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </ProSurface>
  );
}

function SessionForm({ event, draft, setDraft, days, tracks, onSave }: { event: RougeEvent; draft: Draft; setDraft: (d: Draft | null) => void; days: string[]; tracks: string[]; onSave: () => void }) {
  const { state } = useRouge();
  const spots = state.venue_spots.filter((x) => x.event_id === event.id && x.is_active);
  const attendees = state.event_attendees.filter((a) => a.event_id === event.id);
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const patchSpeaker = (i: number, p: Partial<SpeakerInput>) => patch({ speakers: draft.speakers.map((sp, j) => (j === i ? { ...sp, ...p } : sp)) });
  const linkSpeaker = (i: number, userId: string) => {
    if (!userId) return patchSpeaker(i, { user_id: null });
    const face = faceOf(state, userId, event.id);
    patchSpeaker(i, { user_id: userId, name: face?.persona?.display_name || face?.full_name || "", role: face?.persona?.job_title ?? "", company: face?.persona?.company ?? "" });
  };
  const trackOptions = [...new Set([...tracks, ...TRACK_SUGGESTIONS])];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-4 border-b border-pro-line bg-pro-navy/40 p-5"
      data-testid="session-form"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-pro text-base font-semibold">{draft.id ? "Editar charla" : "Nueva charla"}</h3>
        <button type="button" onClick={() => setDraft(null)} className="grid size-11 place-items-center rounded-xl text-pro-mist hover:bg-pro-panel hover:text-white" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className={label}>Título</span>
          <input className={input} value={draft.title} maxLength={SESSION_TITLE_MAX} onChange={(e) => patch({ title: e.target.value })} placeholder="IA aplicada a la pyme: casos reales" data-testid="session-title" />
        </label>
        <label className="md:col-span-2">
          <span className={label}>Descripción</span>
          <textarea className={cn(input, "min-h-[72px] py-2")} value={draft.description} maxLength={SESSION_DESCRIPTION_MAX} onChange={(e) => patch({ description: e.target.value })} placeholder="De qué trata y qué se lleva el público." />
        </label>
        <label>
          <span className={label}>Track</span>
          <input className={input} list="session-tracks" value={draft.track} maxLength={SESSION_TRACK_MAX} onChange={(e) => patch({ track: e.target.value })} data-testid="session-track" />
          <datalist id="session-tracks">
            {trackOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          <span className={label}>Sala · pin del plano</span>
          <select
            className={input}
            value={draft.spot_id ?? ""}
            onChange={(e) => {
              const spot = spots.find((x) => x.id === e.target.value);
              patch({ spot_id: spot?.id ?? null, room_name: spot ? spot.name : draft.spot_id ? "" : draft.room_name });
            }}
            data-testid="session-spot"
          >
            <option value="">Otra sala (sin pin en el plano)</option>
            {spots.map((x) => (
              <option key={x.id} value={x.id}>
                📍 {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Nombre de la sala</span>
          <input className={input} value={draft.room_name} maxLength={SESSION_ROOM_MAX} onChange={(e) => patch({ room_name: e.target.value })} placeholder="Auditorio Principal" data-testid="session-room" />
        </label>
        <label>
          <span className={label}>Cupo para agendar</span>
          <input className={input} inputMode="numeric" value={draft.capacity} onChange={(e) => patch({ capacity: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Sin límite" />
        </label>
        <label>
          <span className={label}>Día</span>
          <select className={input} value={draft.day} onChange={(e) => patch({ day: e.target.value })}>
            {days.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={label}>
              <Clock3 className="mr-1 inline size-3" />
              Empieza
            </span>
            <input type="time" className={input} value={draft.start_time} onChange={(e) => patch({ start_time: e.target.value })} data-testid="session-start" />
          </label>
          <label>
            <span className={label}>Termina</span>
            <input type="time" className={input} value={draft.end_time} onChange={(e) => patch({ end_time: e.target.value })} data-testid="session-end" />
          </label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={label}>Oradores ({draft.speakers.length}/{SESSION_SPEAKERS_MAX})</legend>
        {draft.speakers.map((sp, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-pro-line bg-pro-slate p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input className={input} placeholder="Nombre" value={sp.name} maxLength={SPEAKER_FIELD_MAX} onChange={(e) => patchSpeaker(i, { name: e.target.value })} aria-label={`Nombre del orador ${i + 1}`} data-testid={`speaker-name-${i}`} />
            <input className={input} placeholder="Cargo" value={sp.role ?? ""} maxLength={SPEAKER_FIELD_MAX} onChange={(e) => patchSpeaker(i, { role: e.target.value })} aria-label={`Cargo del orador ${i + 1}`} />
            <input className={input} placeholder="Empresa" value={sp.company ?? ""} maxLength={SPEAKER_FIELD_MAX} onChange={(e) => patchSpeaker(i, { company: e.target.value })} aria-label={`Empresa del orador ${i + 1}`} />
            <button type="button" onClick={() => patch({ speakers: draft.speakers.filter((_, j) => j !== i) })} className="grid size-11 place-items-center rounded-xl text-pro-mist hover:bg-pro-panel hover:text-white" aria-label={`Quitar orador ${i + 1}`}>
              <X className="size-4" />
            </button>
            <label className="md:col-span-2">
              <span className="sr-only">Vincular con un asistente</span>
              <select className={cn(input, "text-xs")} value={sp.user_id ?? ""} onChange={(e) => linkSpeaker(i, e.target.value)}>
                <option value="">Sin vincular a un perfil del evento</option>
                {attendees.map((a) => {
                  const f = faceOf(state, a.user_id, event.id);
                  return (
                    <option key={a.user_id} value={a.user_id}>
                      {f?.persona?.display_name || f?.full_name}
                      {f?.persona?.company ? ` · ${f.persona.company}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <input className={cn(input, "text-xs md:col-span-2")} placeholder="Foto (URL https://…, opcional)" value={sp.avatar_url ?? ""} onChange={(e) => patchSpeaker(i, { avatar_url: e.target.value || null })} aria-label={`Foto del orador ${i + 1}`} />
          </div>
        ))}
        {draft.speakers.length < SESSION_SPEAKERS_MAX && (
          <ProButton size="sm" tone="ghost" onClick={() => patch({ speakers: [...draft.speakers, { name: "", role: "", company: "", user_id: null, avatar_url: null }] })} data-testid="speaker-add">
            <UserPlus /> Agregar orador/a
          </ProButton>
        )}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <ProButton tone="ghost" onClick={() => setDraft(null)}>
          Cancelar
        </ProButton>
        <ProButton type="submit" tone="primary" data-testid="session-save">
          {draft.id ? "Guardar cambios" : "Agregar a la agenda"}
        </ProButton>
      </div>
    </form>
  );
}
