"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Briefcase, CalendarClock, Check, DoorOpen, Lock, MapPin, PencilLine, Plus, Ticket, Users, UsersRound } from "lucide-react";
import type { EventAttendee, MoodTag, Profile, ProfilePersona, RougeEvent, UUID } from "@/lib/types";
import { CorporateProfileSheet } from "@/components/pro/CorporateProfileSheet";
import { personaChoicesFor, proHeadline, vertical, type PersonaChoice } from "@/lib/engine/verticals";
import { resolveAccessCode } from "@/lib/engine/actions";
import { getSupabase } from "@/lib/supabase/client";
import { getAttendee, getProfile, lobbyPhase, squadMembers } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { MoodPicker } from "@/components/event/MoodPicker";
import { moodKind } from "@/lib/engine/verticals";

const moodsKind = (m: MoodTag) => moodKind(m);
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrandLogo, useBrandTheme } from "@/components/brand/BrandTheme";
import { eventTheme, resolveTheme, type EventTheme } from "@/lib/engine/branding";
import type { Brand } from "@/lib/types";

interface Preview {
  event: Pick<RougeEvent, "id" | "kind" | "name" | "description" | "venue_name" | "starts_at" | "ends_at" | "lineup_json" | "lobby_opens_at" | "lobby_expires_at" | "max_capacity">;
  via: EventAttendee["joined_via"];
  attendees: number;
  codeUsedByOther: boolean;
  squad?: { name: string; members: number; creator?: Profile; creatorFirstName?: string };
  /** true si lo resolvió el servidor (el cliente no puede ver el código por RLS) */
  fromServer: boolean;
  /** Logo y colores del evento (su marca): la invitación ya se ve con la identidad de la fiesta. */
  theme: EventTheme;
}

export default function JoinPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = decodeURIComponent(rawCode ?? "");
  const router = useRouter();
  const { state, exec, notify, setActiveEvent, mode, signedIn } = useRouge();
  const now = useNow(30_000);
  const me = getProfile(state, state.current_user_id);

  // 1) Resolución local (Modo Demo / códigos visibles)
  const local = resolveAccessCode(state, code);
  const localPreview: Preview | null = local
    ? {
        event: local.event,
        via: local.via,
        attendees: state.event_attendees.filter((a) => a.event_id === local.event.id).length,
        codeUsedByOther: !!local.inviteCode?.is_used && local.inviteCode.used_by_user_id !== state.current_user_id,
        squad: local.squad
          ? { name: local.squad.name, members: squadMembers(state, local.squad.id).length, creator: getProfile(state, local.squad.created_by) }
          : undefined,
        fromServer: false,
        theme: eventTheme(state, local.event.id),
      }
    : null;

  // 2) Supabase: si no es visible localmente, lo resuelve el servidor (resolve_access_code)
  const [remote, setRemote] = useState<{ code: string; preview: Preview | null } | null>(null);
  useEffect(() => {
    if (mode !== "supabase" || localPreview) return;
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    sb.rpc("resolve_access_code", { p_code: code }).then(({ data }) => {
      if (!alive) return;
      const d = data as null | {
        via: Preview["via"];
        event: Preview["event"] & Pick<RougeEvent, "logo_url" | "theme_primary" | "theme_accent">;
        brand: Pick<Brand, "name" | "logo_url" | "primary_color" | "accent_color"> | null;
        attendees: number;
        code_used_by_other: boolean;
        squad: null | { name: string; members: number; creator_first_name: string | null };
      };
      setRemote({
        code,
        preview: d
          ? { event: { ...d.event, kind: d.event.kind ?? "nightlife" }, via: d.via, attendees: d.attendees, codeUsedByOther: d.code_used_by_other, squad: d.squad ? { name: d.squad.name, members: d.squad.members, creatorFirstName: d.squad.creator_first_name ?? undefined } : undefined, fromServer: true, theme: resolveTheme(d.event, d.brand) }
          : null,
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, code, !!localPreview]);

  // Demo: si no se resuelve en local, es inválido. Supabase: undefined = esperando al servidor.
  const preview = localPreview ?? (mode === "demo" ? null : remote?.code === code ? remote.preview : undefined);
  const existing = preview ? getAttendee(state, preview.event.id, state.current_user_id) : undefined;
  const kind = preview?.event.kind ?? "nightlife";
  const v = vertical(kind);
  const choices = personaChoicesFor(state, state.current_user_id, kind);
  // Mood de otra vertical no sirve (p. ej. un mood viejo): se vuelve a elegir.
  const [mood, setMood] = useState<MoodTag | null>(existing?.mood_tag ?? null);
  const [personaPick, setPersonaPick] = useState<UUID | null | undefined>(existing ? existing.persona_id : undefined);
  // Sin elección explícita: el que ya usaba, si no el primero disponible (Perfil principal en la noche).
  const persona: PersonaChoice | undefined =
    personaPick !== undefined ? (choices.find((c) => (c?.id ?? null) === personaPick) ?? choices[0]) : choices[0];
  useBrandTheme(preview?.theme.custom ? preview.theme : null);
  // ROUGE Pro: la primera vez que entrás a un evento corporativo sin ficha ejecutiva, se abre el panel rápido para
  // crearla acá mismo (sin salir del ingreso). "new" = crear; una persona = editarla.
  const [proSheet, setProSheet] = useState<"new" | ProfilePersona | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);
  const needsPro = kind === "corporate" && !!me && choices.length === 0;
  useEffect(() => {
    if (needsPro && !autoOpened) {
      setAutoOpened(true);
      setProSheet("new");
    }
  }, [needsPro, autoOpened]);

  if (preview === undefined) {
    return (
      <Shell>
        <p className="pt-24 text-center text-sm text-muted" role="status">Buscando tu evento…</p>
      </Shell>
    );
  }

  if (!preview) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 pt-24 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-rouge/15 text-rouge">
            <Ticket className="size-7" />
          </span>
          <h1 className="text-2xl">Código inválido</h1>
          <p className="text-sm text-muted">Revisá el link o el código de tu entrada. Si lo copiaste a mano, fijate O/0 e I/1.</p>
          <Link href="/join" className={cn(buttonVariants({ variant: "glass" }), "mt-2")}>
            Probar otro código
          </Link>
        </div>
      </Shell>
    );
  }

  const { event, via, squad } = preview;
  const phase = lobbyPhase(event as RougeEvent, now);
  const attendees = preview.attendees;
  const usedByOther = preview.codeUsedByOther;
  const full = via !== "single_use_code" && !existing && attendees >= event.max_capacity;
  const squadCreator = squad?.creator;
  const opensIn = Math.max(0, +new Date(event.lobby_opens_at) - now);

  const blocker =
    phase === "upcoming"
      ? `El lobby abre el ${formatDateTime(event.lobby_opens_at)} (en ${Math.ceil(opensIn / 3_600_000)} h).`
      : phase === "expired"
        ? "Este lobby ya cerró. ¡Nos vemos en la próxima!"
        : usedByOther
          ? "Este código ya fue utilizado por otra persona."
          : full
            ? "El evento alcanzó su cupo máximo en la app."
            : null;

  const moodOk = !!mood && v.kind === (moodsKind(mood) ?? "nightlife");
  const enter = async () => {
    if (!mood || !moodOk || persona === undefined) return;
    const r = await exec(C.joinEvent(state.current_user_id, code, mood, preview.fromServer ? event.id : undefined, persona?.id ?? null));
    if (!r.ok) return;
    setActiveEvent(r.data.eventId);
    notify({
      tone: "rouge",
      title: existing ? "Listo, actualizado ✓" : `${v.kind === "corporate" ? "🤝" : "🔥"} Entraste a ${event.name}`,
      description: via === "squad_link" && squad ? `Y te sumaste al ${v.copy.squad} ${squad.name}.` : "Ya aparecés en la grilla de asistentes.",
    });
    router.push("/lobby");
  };
  const createProHref = `/profile/personas/edit?kind=${kind}&next=${encodeURIComponent(`/join/${code}`)}`;

  return (
    <Shell pro={kind === "corporate"}>
      {/* Hero del evento */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-rouge/30 via-surface to-squad/15 p-5">
        <div aria-hidden className="absolute -right-12 -top-12 size-44 rounded-full bg-rouge/35 blur-3xl" />
        <div className="relative">
          {preview.theme.logo_url && <BrandLogo theme={preview.theme} className="mb-4 h-12 max-w-[200px]" />}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={via === "single_use_code" ? "vip" : via === "squad_link" ? "squad" : "rouge"} size="md">
              {via === "single_use_code" ? "🎟️ Entrada única" : via === "squad_link" ? `👯 Invitación de ${v.copy.squad}` : "🔗 Link del evento"}
            </Badge>
            {kind === "corporate" && <Badge tone="squad" size="md">💼 {v.copy.brand}</Badge>}
            {phase === "live" && <Badge tone="live" size="md">En vivo</Badge>}
          </div>
          <h1 className="mt-3 text-[30px] leading-[1.05]">{event.name}</h1>
          <p className="mt-2 text-sm text-muted">{event.description}</p>
          <ul className="mt-4 space-y-1.5 text-sm text-primary/90">
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-muted" /> {event.venue_name}
            </li>
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted" /> {formatDateTime(event.starts_at)} → {formatTime(event.ends_at)}
            </li>
            <li className="flex items-center gap-2">
              <Users className="size-4 text-muted" /> {attendees} personas ya en el lobby
            </li>
          </ul>
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
            {event.lineup_json.map((sl) => (
              <span key={sl.id} className={cn("glass-pill shrink-0 whitespace-nowrap", sl.is_headliner && "border-rouge/50 text-rouge")}>
                {formatTime(sl.starts_at)} · {sl.artist}
              </span>
            ))}
          </div>
        </div>
      </section>

      {squad && (
        <section className="flex items-center gap-3 rounded-2xl border border-squad/30 bg-squad/[0.06] p-3">
          {squadCreator && <Avatar profile={squadCreator} size={44} ring="squad" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {squadCreator?.full_name.split(" ")[0] ?? squad.creatorFirstName ?? "Tu amiga"} te invitó a <span className="text-squad">{squad.name}</span>
            </p>
            <p className="text-xs text-muted">
              <UsersRound className="mr-1 inline size-3.5" />
              {squad.members} en el {v.copy.squad} · se ven en el plano y se cuidan entre sí
            </p>
          </div>
        </section>
      )}

      {blocker ? (
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <Lock className="size-5 shrink-0 text-muted" />
          <p>{blocker}</p>
        </div>
      ) : mode === "supabase" && !signedIn ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted">Ingresá con tu email para entrar. Con una sola cuenta elegís con qué perfil mostrarte en cada evento.</p>
          <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className={buttonVariants({ size: "lg", block: true })}>
            Ingresar y entrar
          </Link>
        </div>
      ) : !me ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted">{kind === "corporate" ? "Creá tu cuenta y después tu perfil profesional para este evento." : "Creá tu perfil una sola vez y usalo en todas tus fiestas."}</p>
          <Link href={`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`} className={buttonVariants({ size: "lg", block: true })}>
            Crear mi perfil y entrar
          </Link>
        </div>
      ) : (
        <section className="space-y-4">
          {/* 1. Con qué perfil mostrarse (una cuenta, varias caras) */}
          <div className="space-y-2">
            <div>
              <h2 className="text-lg">{existing ? "Ya estás adentro · ¿con qué perfil te ven?" : "¿Con qué perfil te mostrás?"}</h2>
              <p className="text-sm text-muted">
                {kind === "corporate"
                  ? "En este evento te ven solo con tu perfil profesional: nunca con el de la noche."
                  : "Elegí cuál ven los demás en esta fiesta. Lo podés cambiar cuando quieras."}
              </p>
            </div>
            {choices.length === 0 ? (
              <button type="button" onClick={() => setProSheet("new")} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-pro-sapphire/60 bg-pro-slate p-4 text-left" data-testid="create-corporate-profile">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pro-sapphire/20 text-white">
                  <Briefcase className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-white">Crear mi ficha ejecutiva</span>
                  <span className="block text-xs text-pro-mist">Cargo, empresa y qué buscás u ofrecés. Te toma 1 minuto.</span>
                </span>
                <Plus className="size-5 text-white" />
              </button>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Perfil para este evento">
                {choices.map((c) => {
                  const on = (c?.id ?? null) === (persona?.id ?? null);
                  return (
                    <button
                      key={c?.id ?? "main"}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPersonaPick(c?.id ?? null)}
                      className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition", on ? "border-rouge bg-rouge/10" : "border-white/10 bg-white/[0.03]")}
                    >
                      <Avatar profile={c ? { ...me, full_name: c.display_name, photos: c.photos } : me} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{c ? c.label : "Perfil principal"}</span>
                        <span className="block truncate text-xs text-muted">{c ? (c.kind === "corporate" ? proHeadline(c) : c.music_genres.join(" · ") || c.display_name) : `@${me.username}`}</span>
                      </span>
                      {on && <Check className="size-5 shrink-0 text-rouge" />}
                    </button>
                  );
                })}
                <div className="flex flex-wrap items-center gap-x-4">
                  {kind === "corporate" && persona && (
                    <button type="button" onClick={() => setProSheet(persona)} className="inline-flex min-h-touch items-center gap-1.5 px-1 text-sm text-primary/90 hover:text-primary">
                      <PencilLine className="size-4" /> Revisar mi ficha
                    </button>
                  )}
                  <Link href={createProHref} className="inline-flex min-h-touch items-center gap-1.5 px-1 text-sm text-muted hover:text-primary">
                    <Plus className="size-4" /> Crear otro perfil {kind === "corporate" ? "profesional" : "para la noche"}
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 2. Mood / a qué viene */}
          {choices.length > 0 && (
            <>
              <div>
                <h2 className="text-lg">{existing ? `¿Cambió tu ${kind === "corporate" ? "objetivo" : "mood"}?` : v.copy.moodQuestion(me.full_name.split(" ")[0])}</h2>
                <p className="text-sm text-muted">{v.copy.moodTitle}: se ve en tu tarjeta y ajusta a quién te recomendamos.</p>
              </div>
              <MoodPicker kind={kind} value={moodOk ? mood : null} onChange={setMood} />
              <Button block size="lg" disabled={!moodOk || persona === undefined} onClick={enter}>
                <DoorOpen /> {existing ? "Volver al lobby" : v.copy.enterCta}
              </Button>
            </>
          )}
          {via === "single_use_code" && !existing && <p className="text-center text-xs text-muted">Este código es personal: queda asociado a tu perfil al entrar.</p>}
        </section>
      )}
      {proSheet && (
        <CorporateProfileSheet
          key={proSheet === "new" ? "new" : proSheet.id}
          open
          onClose={() => setProSheet(null)}
          persona={proSheet === "new" ? null : proSheet}
          title={proSheet === "new" ? `Tu ficha para ${event.name}` : undefined}
          onSaved={(p) => setPersonaPick(p.id)}
        />
      )}
    </Shell>
  );
}

function Shell({ children, pro }: { children: React.ReactNode; pro?: boolean }) {
  return (
    <main className="safe-top space-y-5 px-4 pb-10 pt-4">
      <Link href="/" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
        ROUGE{pro && <span className="ml-1.5 align-middle font-sans text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">Pro</span>}
      </Link>
      {children}
    </main>
  );
}
