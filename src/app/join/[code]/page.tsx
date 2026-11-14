"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarClock, DoorOpen, Lock, MapPin, Ticket, Users, UsersRound } from "lucide-react";
import type { EventAttendee, MoodTag, Profile, RougeEvent } from "@/lib/types";
import { resolveAccessCode } from "@/lib/engine/actions";
import { getSupabase } from "@/lib/supabase/client";
import { getAttendee, getProfile, lobbyPhase, squadMembers } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { MoodPicker } from "@/components/event/MoodPicker";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

interface Preview {
  event: Pick<RougeEvent, "id" | "name" | "description" | "venue_name" | "starts_at" | "ends_at" | "lineup_json" | "lobby_opens_at" | "lobby_expires_at" | "max_capacity">;
  via: EventAttendee["joined_via"];
  attendees: number;
  codeUsedByOther: boolean;
  squad?: { name: string; members: number; creator?: Profile; creatorFirstName?: string };
  /** true si lo resolvió el servidor (el cliente no puede ver el código por RLS) */
  fromServer: boolean;
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
      const d = data as null | { via: Preview["via"]; event: Preview["event"]; attendees: number; code_used_by_other: boolean; squad: null | { name: string; members: number; creator_first_name: string | null } };
      setRemote({
        code,
        preview: d
          ? { event: d.event, via: d.via, attendees: d.attendees, codeUsedByOther: d.code_used_by_other, squad: d.squad ? { name: d.squad.name, members: d.squad.members, creatorFirstName: d.squad.creator_first_name ?? undefined } : undefined, fromServer: true }
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
  const [mood, setMood] = useState<MoodTag | null>(existing?.mood_tag ?? null);

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
          <span className="grid size-16 place-items-center rounded-full bg-rouge/12 text-rouge">
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

  const enter = async () => {
    if (!mood) return;
    const r = await exec(C.joinEvent(state.current_user_id, code, mood, preview.fromServer ? event.id : undefined));
    if (!r.ok) return;
    setActiveEvent(r.data.eventId);
    notify({
      tone: "rouge",
      title: existing ? "Mood actualizado ✓" : `🔥 Entraste a ${event.name}`,
      description: via === "squad_link" && squad ? `Y te sumaste al Squad ${squad.name}.` : "Ya aparecés en la grilla de asistentes.",
    });
    router.push("/lobby");
  };

  return (
    <Shell>
      {/* Hero del evento */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-rouge/30 via-surface to-squad/15 p-5">
        <div aria-hidden className="absolute -right-12 -top-12 size-44 rounded-full bg-rouge/35 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={via === "single_use_code" ? "vip" : via === "squad_link" ? "squad" : "rouge"} size="md">
              {via === "single_use_code" ? "🎟️ Entrada única" : via === "squad_link" ? "👯 Invitación de Squad" : "🔗 Link del evento"}
            </Badge>
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
              {squad.members} en el Squad · se ven en el plano y se cuidan entre sí
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
          <p className="text-sm text-muted">Ingresá con tu email para entrar al lobby. Tu perfil sirve para todas tus fiestas.</p>
          <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className={buttonVariants({ size: "lg", block: true })}>
            Ingresar y entrar
          </Link>
        </div>
      ) : !me ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted">Creá tu perfil una sola vez y usalo en todas tus fiestas.</p>
          <Link href={`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`} className={buttonVariants({ size: "lg", block: true })}>
            Crear mi perfil y entrar
          </Link>
        </div>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg">{existing ? "Ya estás adentro · ¿cambió tu mood?" : `${me.full_name.split(" ")[0]}, ¿cómo venís hoy?`}</h2>
            <p className="text-sm text-muted">Tu perfil ya está listo. Solo elegí tu Mood de la noche.</p>
          </div>
          <MoodPicker value={mood} onChange={setMood} />
          <Button block size="lg" disabled={!mood} onClick={enter}>
            <DoorOpen /> {existing ? "Volver al lobby" : "Entrar a la fiesta"}
          </Button>
          {via === "single_use_code" && !existing && <p className="text-center text-xs text-muted">Este código es personal: queda asociado a tu perfil al entrar.</p>}
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="safe-top space-y-5 px-4 pb-10 pt-4">
      <Link href="/" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
        ROUGE
      </Link>
      {children}
    </main>
  );
}
