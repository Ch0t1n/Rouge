"use client";

/** Acceso a la agenda desde el inicio del asistente (ROUGE Pro): charla en vivo y mi próxima charla agendada. */
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { UUID } from "@/lib/types";
import { liveSessions, myAgendaIds, sessionPhase, sessionsOf } from "@/lib/engine/schedule";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { LiveBadge, ProSurface } from "./scheduleUi";

export function AgendaHomeCard({ eventId }: { eventId: UUID }) {
  const { state } = useRouge();
  const now = useNow(30_000);
  const all = sessionsOf(state, eventId);
  if (!all.length) return null;
  const mine = myAgendaIds(state, state.current_user_id, eventId);
  const live = liveSessions(state, eventId)[0];
  const next = all.find((x) => mine.has(x.id) && sessionPhase(x, now) !== "past" && x.id !== live?.id);
  return (
    <ProSurface>
      <Link href={live ? `/agenda/${live.id}` : "/agenda"} className="block overflow-hidden rounded-2xl border border-pro-line bg-pro-slate transition hover:border-pro-mist/40" data-testid="agenda-home">
        <div className="flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pro-cobalt text-white">
            <CalendarDays className="size-5" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="flex items-center gap-2">
              Agenda {live && <LiveBadge />}
            </b>
            <span className="block truncate text-pro-mist">{live ? `${live.title} · ${live.room_name}` : `${all.length} charlas · ${mine.size} en Mi Agenda`}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-pro-mist" />
        </div>
        {next && (
          <p className="truncate border-t border-pro-line px-4 py-2 text-xs text-pro-mist">
            Tu próxima: <b className="font-semibold text-white">{next.start_time}</b> · {next.title} · {next.room_name}
          </p>
        )}
      </Link>
      {live && (
        <Link href="/agenda" className="mt-1.5 block text-right text-[11px] font-semibold text-pro-mist hover:text-white">
          Ver toda la agenda →
        </Link>
      )}
    </ProSurface>
  );
}
