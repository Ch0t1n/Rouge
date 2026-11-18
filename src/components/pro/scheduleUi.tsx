"use client";

/**
 * Piezas compartidas de la agenda corporativa (ROUGE Pro): badge de track con tonos formales, oradores, botones con la
 * paleta ejecutiva (pro-*) y el flujo "Agendar" con aviso de superposición (confirmar o reemplazar).
 * Solo colores pro-* y fuentes font-pro / font-pro-mono: nunca rouge/squad/vip.
 */
import * as C from "@/lib/store/commands";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CalendarCheck2, CalendarPlus, Repeat2, TriangleAlert } from "lucide-react";
import type { EventSession, SessionSpeaker } from "@/lib/types";
import { agendaConflicts, conflictMessage, isEnrolled, seatsLeft, sessionPhase, trackTone, type TrackTone } from "@/lib/engine/schedule";
import { getAttendee } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { proFontVars } from "./fonts";

const TONE: Record<TrackTone, { badge: string; bar: string }> = {
  cobalt: { badge: "border-pro-cobalt/50 bg-pro-cobalt/15", bar: "bg-pro-cobalt" },
  emerald: { badge: "border-pro-emerald/50 bg-pro-emerald/15", bar: "bg-pro-emerald" },
  gold: { badge: "border-pro-gold/50 bg-pro-gold/15", bar: "bg-pro-gold" },
  sapphire: { badge: "border-pro-sapphire/50 bg-pro-sapphire/10", bar: "bg-pro-sapphire" },
  mist: { badge: "border-pro-mist/40 bg-pro-mist/10", bar: "bg-pro-mist" },
};

export const trackBarClass = (tracks: string[], track: string) => TONE[trackTone(tracks, track)].bar;

export function TrackBadge({ tracks, track, className }: { tracks: string[]; track: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-0.5 font-pro-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-pro-alabaster", TONE[trackTone(tracks, track)].badge, className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", TONE[trackTone(tracks, track)].bar)} aria-hidden />
      {track}
    </span>
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-pro-emerald/50 bg-pro-emerald/15 px-2 py-0.5 font-pro-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white", className)}>
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-pro-emerald opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-pro-emerald" />
      </span>
      En vivo
    </span>
  );
}

export function SpeakerList({ speakers, compact = false }: { speakers: SessionSpeaker[]; compact?: boolean }) {
  if (!speakers.length) return null;
  return (
    <ul className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
      {speakers.map((sp, i) => (
        <li key={`${sp.name}-${i}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar profile={{ full_name: sp.name, photos: sp.avatar_url ? [{ url: sp.avatar_url }] : [] }} size={compact ? 28 : 36} className="shrink-0 rounded-lg bg-pro-panel font-pro text-[11px] text-pro-mist ring-1 ring-pro-line" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-white">{sp.name}</span>
            {(sp.role || sp.company) && <span className="block truncate text-[11px] text-pro-mist">{[sp.role, sp.company].filter(Boolean).join(" · ")}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ProButtonTone = "primary" | "outline" | "ghost" | "success";
const PRO_BTN: Record<ProButtonTone, string> = {
  primary: "bg-pro-cobalt text-white hover:bg-pro-sapphire",
  outline: "border border-pro-line bg-pro-navy/40 text-pro-alabaster hover:border-pro-mist/40 hover:bg-pro-panel",
  ghost: "text-pro-mist hover:bg-pro-panel hover:text-white",
  success: "border border-pro-emerald/50 bg-pro-emerald/15 text-white hover:bg-pro-emerald/25",
};

export function ProButton({ tone = "outline", size = "md", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ProButtonTone; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-pro font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pro-sapphire [&_svg]:size-4 [&_svg]:shrink-0",
        size === "sm" ? "min-h-[36px] px-3 text-xs" : "min-h-touch px-4 text-sm",
        PRO_BTN[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Contenedor con la identidad ejecutiva (fuentes Inter + JetBrains Mono, navy, alabaster). */
export function ProSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(proFontVars, "font-pro text-pro-alabaster", className)}>{children}</div>;
}

/**
 * "Agendar / Agendado ✓" con detección de conflictos: si la charla se superpone con otra de Mi Agenda, abre un aviso
 * con el nombre y la hora de la otra y deja confirmar (quedan las dos) o reemplazar (sale la otra).
 */
export function useAgendaToggle() {
  const { state, exec, notify } = useRouge();
  const [pending, setPending] = useState<{ session: EventSession; conflicts: EventSession[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const me = state.current_user_id;

  const enroll = async (session: EventSession, replaceIds: string[] = []) => {
    setBusy(true);
    const r = await exec(C.enrollSession(me, session.id, replaceIds));
    setBusy(false);
    setPending(null);
    if (!r.ok) return;
    notify({ tone: "squad", title: "⭐ Agendada", description: replaceIds.length ? `${session.title} reemplazó ${replaceIds.length === 1 ? "a la otra charla" : `${replaceIds.length} charlas`}.` : `${session.title} · ${session.start_time} hs` });
  };

  const toggle = async (session: EventSession) => {
    if (isEnrolled(state, me, session.id)) {
      const r = await exec(C.unenrollSession(me, session.id));
      if (r.ok) notify({ tone: "info", title: "Quitada de Mi Agenda", description: session.title });
      return;
    }
    const conflicts = agendaConflicts(state, me, session);
    if (conflicts.length) setPending({ session, conflicts });
    else await enroll(session);
  };

  const sheet = (
    <BottomSheet open={!!pending} onClose={() => setPending(null)} title="Choque de horarios" description="Ya tenés agendado algo en ese horario." className="border-pro-line bg-pro-navy">
      {pending && (
        <ProSurface className="space-y-4" >
          <ul className="space-y-2" data-testid="agenda-conflict">
            {pending.conflicts.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 rounded-xl border border-pro-gold/50 bg-pro-gold/10 p-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-pro-gold" />
                <span>
                  <b className="block font-semibold">{conflictMessage(c)}</b>
                  <span className="text-xs text-pro-mist">{c.room_name} · {c.start_time}–{c.end_time}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-pro-mist">
            Querés agendar <b className="text-white">«{pending.session.title}»</b> ({pending.session.start_time}–{pending.session.end_time}, {pending.session.room_name}).
          </p>
          <div className="grid gap-2">
            <ProButton tone="primary" disabled={busy} onClick={() => enroll(pending.session, pending.conflicts.map((c) => c.id))}>
              <Repeat2 /> Reemplazar {pending.conflicts.length === 1 ? "la otra charla" : `las ${pending.conflicts.length} charlas`}
            </ProButton>
            <ProButton tone="outline" disabled={busy} onClick={() => enroll(pending.session)}>
              <CalendarPlus /> Agendar igual (quedan las dos)
            </ProButton>
            <ProButton tone="ghost" onClick={() => setPending(null)}>
              Cancelar
            </ProButton>
          </div>
        </ProSurface>
      )}
    </BottomSheet>
  );

  return { toggle, sheet };
}

/** Botón ⭐ "Agendar" / "Agendado ✓" con los estados de la charla (terminó, sin lugares, entrar al evento). */
export function AgendaButton({ session, onToggle, block = false }: { session: EventSession; onToggle: (s: EventSession) => void; block?: boolean }) {
  const { state } = useRouge();
  const now = useNow(30_000);
  const me = state.current_user_id;
  const mine = isEnrolled(state, me, session.id);
  const attendee = !!getAttendee(state, session.event_id, me);
  const over = sessionPhase(session, now) === "past";
  const full = !mine && seatsLeft(session) === 0;
  const label = mine ? "Agendado ✓" : over ? "Terminó" : full ? "Sin lugares" : "Agendar";
  return (
    <ProButton
      tone={mine ? "success" : "primary"}
      size="sm"
      className={cn(block && "w-full")}
      aria-pressed={mine}
      disabled={!attendee || (!mine && (over || full))}
      title={attendee ? undefined : "Entrá al evento para armar tu agenda"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(session);
      }}
      data-testid={`agenda-toggle-${session.id}`}
    >
      {mine ? <CalendarCheck2 /> : <span aria-hidden>⭐</span>} {label}
    </ProButton>
  );
}
