"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Ghost, Inbox, MapPin, Moon, SlidersHorizontal, X } from "lucide-react";
import { MOOD_TAGS, MUSIC_GENRES, type MoodTag } from "@/lib/types";
import { OFFERABLE_NEEDS, moodsFor, personasOf, verticalOf } from "@/lib/engine/verticals";
import { updateAttendeeSettings } from "@/lib/engine/actions";
import { activeFilterCount, EMPTY_FILTERS, lobbyGrid, type GridFilters } from "@/lib/engine/grid";
import { activeEvent, getAttendee, inboxOf, lobbyPhase } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { LineupBanner } from "@/components/event/LineupBanner";
import { MoodPicker } from "@/components/event/MoodPicker";
import { PersonaSwitcher } from "@/components/layout/PersonaSwitcher";
import { GridCard } from "@/components/lobby/GridCard";
import { useMatchCelebration } from "@/components/lobby/MatchCelebration";
import { useConnect } from "@/components/lobby/useConnect";
import { LiveDot } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function LobbyPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Lobby />;
}

function Lobby() {
  const { state, exec, notify } = useRouge();
  const now = useNow(30_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const attendee = getAttendee(state, event.id, meId);
  const phase = lobbyPhase(event, now);
  const [filters, setFilters] = useState<GridFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const celebration = useMatchCelebration();
  const connect = useConnect(celebration.show);

  const grid = useMemo(() => lobbyGrid(state, event.id, meId, filters, now), [state, event.id, meId, filters, now]);
  const pending = inboxOf(state, meId, event.id).length;
  const mood = MOOD_TAGS.find((m) => m.id === attendee?.mood_tag);
  const nFilters = activeFilterCount(filters);
  const v = verticalOf(state, event.id);
  const pro = v.kind === "corporate";
  const myPersona = attendee?.persona_id ? personasOf(state, meId).find((p) => p.id === attendee.persona_id) : null;

  // ── Estados sin grilla ────────────────────────────────────────────
  if (phase === "expired") {
    return (
      <Empty icon={<Moon className="size-7" />} title={pro ? "El networking cerró" : "El lobby cerró 🌙"} text={`La grilla y el plano se apagaron, pero tus ${v.copy.matches.toLowerCase()} y chats siguen abiertos para siempre.`}>
        <Link href="/inbox" className={buttonVariants({ size: "lg" })}>
          Ver mis {v.copy.matches.toLowerCase()}
        </Link>
      </Empty>
    );
  }
  if (!attendee) {
    return (
      <Empty icon={<Inbox className="size-7" />} title="Todavía no entraste" text={`Usá el link o el código de tu entrada para entrar a ${event.name}.`}>
        <Link href={`/join/${event.slug}`} className={buttonVariants({ size: "lg" })}>
          Entrar al lobby
        </Link>
      </Empty>
    );
  }

  const setSetting = (patch: Parameters<typeof updateAttendeeSettings>[3]) => exec(C.updateAttendeeSettings(event.id, meId, patch));

  const vert = v;
  const toggleGhost = async (on: boolean) => {
    const r = await setSetting({ ghost_mode: on });
    if (r.ok)
      notify({
        tone: on ? "squad" : "rouge",
        title: on ? `👻 ${vert.copy.ghost} activado` : "✨ Volviste a la grilla",
        description: on ? `Nadie nuevo te ve en la grilla. Tu ${vert.copy.squad}, tus ${vert.copy.matches.toLowerCase()}, el plano, la barra y los sorteos siguen funcionando.` : "Ya aparecés para conectar.",
      });
  };

  return (
    <main className="safe-top">
      {/* Header */}
      <header className="sticky top-0 z-30 space-y-3 bg-background/85 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rouge">
              {phase === "live" && <LiveDot />} {phase === "live" ? "En vivo" : phase === "afterglow" ? (pro ? "Después del evento · networking abierto" : "After · lobby abierto") : pro ? "Networking abierto" : "Lobby abierto"}
            </p>
            <h1 className="truncate text-xl leading-tight">{event.name}</h1>
          </div>
          <Link href="/inbox" aria-label={`Bandeja, ${pending} solicitudes`} className="glass relative grid size-11 place-items-center rounded-full">
            <Inbox className="size-5" />
            {pending > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-rouge px-1 font-display text-[10px] font-bold leading-[18px] text-white">{pending}</span>}
          </Link>
          <PersonaSwitcher />
        </div>

        {/* Switch rápido de privacidad */}
        <div className={cn("flex items-center gap-3 rounded-2xl border px-3 py-1.5 transition", attendee.ghost_mode ? "border-squad/40 bg-squad/[0.07]" : "border-white/10 bg-white/[0.03]")}>
          <Ghost className={cn("size-5 shrink-0", attendee.ghost_mode ? "text-squad" : "text-muted")} />
          <Switch tone="squad" checked={attendee.ghost_mode} onCheckedChange={toggleGhost} id="ghost" label={v.copy.ghost} description={attendee.ghost_mode ? "No aparecés en la grilla" : "Ocultarme de la grilla de conexiones"} className="flex-1" />
        </div>
      </header>

      <div className="space-y-4 px-4 pb-8">
        <LineupBanner event={event} />

        {/* Con qué perfil me ven en este evento (se cambia desde el ingreso) */}
        <Link href={`/join/${event.slug}`} className="glass flex min-h-touch items-center justify-between gap-3 rounded-2xl px-4 py-2 text-sm">
          <span className="min-w-0 truncate">
            <span className="text-muted">Te ven con: </span>
            <span className="font-semibold">{myPersona ? myPersona.label : "Perfil principal"}</span>
          </span>
          <span className="shrink-0 text-xs text-rouge">Cambiar</span>
        </Link>

        {attendee.ghost_mode ? (
          <section className="rounded-3xl border border-squad/25 bg-squad/[0.05] p-6 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-squad/15 text-squad shadow-glow-squad">
              <Ghost className="size-7" />
            </span>
            <h2 className="mt-4 text-xl">Estás en {v.copy.ghost}</h2>
            <p className="mt-2 text-sm text-muted">{pro ? "Nadie nuevo te ve en la grilla y no recibís pedidos de contacto nuevos." : "Nadie nuevo te ve en la grilla y no recibís conexiones nuevas. Ideal si estás en pareja o venís a bailar con tu Squad."}</p>
            <ul className="mt-4 space-y-1 text-left text-sm text-primary/85">
              <li>✓ Tu {v.copy.squad} y tus {v.copy.matches.toLowerCase()} te siguen viendo</li>
              <li>✓ Plano, {v.copy.bar}, perks y sorteos activos</li>
              <li>✓ Podés aceptar solicitudes que ya tenías</li>
            </ul>
            <Button variant="glass" className="mt-5" onClick={() => toggleGhost(false)}>
              Volver a la grilla
            </Button>
          </section>
        ) : (
          <>
            {/* Mood + filtros */}
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              <button type="button" onClick={() => setMoodOpen(true)} className="glass-pill inline-flex min-h-[40px] shrink-0 items-center gap-1.5 px-3 text-xs">
                {mood ? `${mood.emoji} ${mood.label}` : "Elegí tu mood"} <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={cn("inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold", nFilters ? "border-rouge/60 bg-rouge/15 text-primary" : "border-white/15 bg-white/[0.06] text-primary")}
              >
                <SlidersHorizontal className="size-3.5" /> Filtros{nFilters ? ` · ${nFilters}` : ""}
              </button>
              <button
                type="button"
                aria-pressed={filters.sameZone}
                onClick={() => setFilters((f) => ({ ...f, sameZone: !f.sameZone }))}
                className={cn("inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold", filters.sameZone ? "border-squad/60 bg-squad/15 text-squad" : "border-white/15 bg-white/[0.06] text-primary")}
              >
                <MapPin className="size-3.5" /> Coincidieron en tu zona
              </button>
              {nFilters > 0 && (
                <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="inline-flex min-h-[40px] shrink-0 items-center gap-1 px-2 text-xs text-muted">
                  <X className="size-3.5" /> Limpiar
                </button>
              )}
            </div>

            <div className="flex items-baseline justify-between">
              <h2 className="text-lg">{pro ? "Recomendados para tu negocio" : phase === "afterglow" ? "Los que vibraron con vos" : "Afines a vos esta noche"}</h2>
              <span className="text-xs text-muted">{grid.length} personas</span>
            </div>

            {grid.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">
                {nFilters ? "Nadie coincide con esos filtros todavía." : "Todavía no hay nadie más en la grilla. ¡Compartí el link con tu gente!"}
                {filters.sameZone && <p className="mt-2">Dejá tu pin en el plano para que podamos cruzar zonas.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {grid.map((card, i) => (
                  <GridCard key={card.profile.id} card={card} priority={i < 4} onConnect={() => connect(card.profile)} />
                ))}
              </div>
            )}
            <p className="pt-2 text-center text-[11px] text-muted/70">{pro ? "Ordenado por lo que buscás y lo que ofrecen, a qué vienen y actividad reciente." : "Ordenado por afinidad musical, mood y actividad reciente."}</p>
          </>
        )}

        {/* Privacidad avanzada de la noche */}
        <section className="glass rounded-2xl px-4 py-1">
          <Switch
            tone="rouge"
            id="only-liked"
            checked={attendee.only_liked_can_icebreak}
            onCheckedChange={(v) => setSetting({ only_liked_can_icebreak: v })}
            label={`${v.copy.icebreaker} solo de quien conecté`}
            description={`Solo te pueden escribir sin ${v.copy.match.toLowerCase()} las personas a las que les diste Conectar.`}
          />
        </section>
      </div>

      {/* Mood */}
      <BottomSheet open={moodOpen} onClose={() => setMoodOpen(false)} title={pro ? "¿A qué venís ahora?" : "¿Cómo venís ahora?"} description="Se ve en tu tarjeta y ajusta las recomendaciones.">
        <MoodPicker
          kind={v.kind}
          value={attendee.mood_tag}
          onChange={(m: MoodTag) => {
            setSetting({ mood_tag: m });
            setMoodOpen(false);
          }}
        />
      </BottomSheet>

      {/* Filtros */}
      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar la grilla"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="glass" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpiar
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Ver {grid.length}</Button>
          </div>
        }
      >
        <div className="space-y-5">
          {pro ? (
            <FilterGroup title="Que ofrezcan">
              {OFFERABLE_NEEDS.map((n) => (
                <Chip key={n.id} on={filters.needs.includes(n.id)} onClick={() => setFilters((f) => ({ ...f, needs: f.needs.includes(n.id) ? f.needs.filter((x) => x !== n.id) : [...f.needs, n.id] }))}>
                  {n.emoji} {n.label}
                </Chip>
              ))}
            </FilterGroup>
          ) : (
            <FilterGroup title="Género musical">
              {MUSIC_GENRES.map((g) => (
                <Chip key={g} on={filters.genres.includes(g)} onClick={() => setFilters((f) => ({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] }))}>
                  {g}
                </Chip>
              ))}
            </FilterGroup>
          )}
          <FilterGroup title={v.copy.moodTitle}>
            {moodsFor(v.kind).map((m) => (
              <Chip key={m.id} on={filters.moods.includes(m.id)} onClick={() => setFilters((f) => ({ ...f, moods: f.moods.includes(m.id) ? f.moods.filter((x) => x !== m.id) : [...f.moods, m.id] }))}>
                {m.emoji} {m.label}
              </Chip>
            ))}
          </FilterGroup>
          <Switch tone="squad" id="same-zone" checked={filters.sameZone} onCheckedChange={(v) => setFilters((f) => ({ ...f, sameZone: v }))} label="📍 Coincidieron en tu zona del plano" description="Gente que dejó su pin en los mismos sectores que vos." />
        </div>
      </BottomSheet>

      {celebration.element}
    </main>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("min-h-[40px] rounded-full border px-3.5 text-sm font-semibold transition", on ? "border-rouge bg-rouge/15 text-primary" : "border-white/15 bg-white/[0.04] text-primary/85")}
    >
      {children}
    </button>
  );
}

function Empty({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className="safe-top flex min-h-[80dvh] flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-rouge/15 text-rouge">{icon}</span>
      <h1 className="text-2xl">{title}</h1>
      <p className="text-sm text-muted">{text}</p>
      <div className="mt-3">{children}</div>
    </main>
  );
}
