"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Ghost, Inbox, MapPin, Moon, SlidersHorizontal, X } from "lucide-react";
import { MUSIC_GENRES, PRO_INTERESTS, type MoodTag } from "@/lib/types";
import { copyFor, eventTypeOf, moodMeta, moodsFor } from "@/lib/engine/eventType";
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
  const mood = moodMeta(attendee?.mood_tag);
  const nFilters = activeFilterCount(filters);
  const type = eventTypeOf(event);
  const copy = copyFor(type);
  const tagOptions: readonly string[] = type === "corporate" ? PRO_INTERESTS : MUSIC_GENRES;

  // ── Estados sin grilla ────────────────────────────────────────────
  if (phase === "expired") {
    return (
      <Empty icon={<Moon className="size-7" />} title="El lobby cerró 🌙" text={`La grilla y el plano se apagaron, pero tus ${copy.matches.toLowerCase()} y chats siguen abiertos para siempre.`}>
        <Link href="/inbox" className={buttonVariants({ size: "lg" })}>
          Ver mis {copy.matches.toLowerCase()}
        </Link>
      </Empty>
    );
  }
  if (!attendee) {
    return (
      <Empty icon={<Inbox className="size-7" />} title="Todavía no entraste" text={`Usá el link o el código de tu entrada para entrar al lobby de ${event.name}.`}>
        <Link href={`/join/${event.slug}`} className={buttonVariants({ size: "lg" })}>
          Entrar al lobby
        </Link>
      </Empty>
    );
  }

  const setSetting = (patch: Parameters<typeof updateAttendeeSettings>[3]) => exec(C.updateAttendeeSettings(event.id, meId, patch));

  const toggleGhost = async (v: boolean) => {
    const r = await setSetting({ ghost_mode: v });
    if (r.ok)
      notify({
        tone: v ? "squad" : "rouge",
        title: v ? "👻 Modo Solo Amigos activado" : "✨ Volviste a la grilla",
        description: v ? `Nadie nuevo te ve en la grilla. Tu Squad, tus ${copy.matches.toLowerCase()}, el plano, la barra y los sorteos siguen funcionando.` : "Ya aparecés para conectar.",
      });
  };

  return (
    <main className="safe-top">
      {/* Header */}
      <header className="sticky top-0 z-30 space-y-3 bg-background/85 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rouge">
              {phase === "live" && <LiveDot />} {phase === "live" ? "En vivo" : phase === "afterglow" ? "After · lobby abierto" : "Lobby abierto"}
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
          <Switch tone="squad" checked={attendee.ghost_mode} onCheckedChange={toggleGhost} id="ghost" label="Modo Solo Amigos" description={attendee.ghost_mode ? "No aparecés en la grilla" : "Ocultarme de la grilla de conexiones"} className="flex-1" />
        </div>
      </header>

      <div className="space-y-4 px-4 pb-8">
        <LineupBanner event={event} />

        {attendee.ghost_mode ? (
          <section className="rounded-3xl border border-squad/25 bg-squad/[0.05] p-6 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-squad/15 text-squad shadow-glow-squad">
              <Ghost className="size-7" />
            </span>
            <h2 className="mt-4 text-xl">Estás en Modo Solo Amigos</h2>
            <p className="mt-2 text-sm text-muted">Nadie nuevo te ve en la grilla y no recibís conexiones nuevas. {copy.ghostHint}</p>
            <ul className="mt-4 space-y-1 text-left text-sm text-primary/85">
              <li>✓ Tu Squad y tus {copy.matches.toLowerCase()} te siguen viendo</li>
              <li>✓ Plano, Barra Express, perks y sorteos activos</li>
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
                {mood ? `${mood.emoji} ${mood.label}` : type === "corporate" ? "¿Qué venís a buscar?" : "Elegí tu mood"} <ChevronDown className="size-3.5" />
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
              <h2 className="text-lg">{phase === "afterglow" ? (type === "corporate" ? "Los que coincidieron con vos" : "Los que vibraron con vos") : copy.gridTitle}</h2>
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
                  <GridCard key={card.profile.id} card={card} type={type} priority={i < 4} onConnect={() => connect(card.profile)} />
                ))}
              </div>
            )}
            <p className="pt-2 text-center text-[11px] text-muted/70">{copy.gridHint}</p>
          </>
        )}

        {/* Privacidad avanzada de la noche */}
        <section className="glass rounded-2xl px-4 py-1">
          <Switch
            tone="rouge"
            id="only-liked"
            checked={attendee.only_liked_can_icebreak}
            onCheckedChange={(v) => setSetting({ only_liked_can_icebreak: v })}
            label="Rompehielos solo de quien conecté"
            description="Solo te pueden escribir sin match las personas a las que les diste Conectar."
          />
        </section>
      </div>

      {/* Mood */}
      <BottomSheet open={moodOpen} onClose={() => setMoodOpen(false)} title={copy.moodQuestion} description={copy.moodHint}>
        <MoodPicker
          type={type}
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
          <FilterGroup title={copy.tagsTitle}>
            {tagOptions.map((g) => (
              <Chip key={g} on={filters.tags.includes(g)} onClick={() => setFilters((f) => ({ ...f, tags: f.tags.includes(g) ? f.tags.filter((x) => x !== g) : [...f.tags, g] }))}>
                {g}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title={copy.moodTitle}>
            {moodsFor(type).map((m) => (
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
