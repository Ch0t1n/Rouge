"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import { directMessages, getEvent, matchesOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

/** Matches de TODOS los eventos con su último mensaje, del más reciente al más viejo (sobreviven al cierre del lobby). */
export function useConversations() {
  const { state } = useRouge();
  const meId = state.current_user_id;
  return useMemo(
    () =>
      matchesOf(state, meId)
        .map((m) => {
          const msgs = directMessages(state, m.connection.id);
          const last = msgs.at(-1);
          return { ...m, last, sortKey: last?.created_at ?? m.connection.responded_at ?? m.connection.created_at };
        })
        .sort((a, b) => +new Date(b.sortKey) - +new Date(a.sortKey)),
    [state, meId],
  );
}

/** Lista de conversaciones 1:1. `activeId` resalta el chat abierto (vista dividida en PC). */
export function ConversationList({ activeId, compact }: { activeId?: string; compact?: boolean }) {
  const { state } = useRouge();
  const meId = state.current_user_id;
  const matches = useConversations();
  if (!matches.length) return <p className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">Todavía no tenés matches. Cuando alguien te conecte de vuelta, aparece acá para siempre.</p>;
  return (
    <ul className={cn(compact ? "space-y-1" : "space-y-3")}>
      {matches.map(({ connection: c, profile: p, last }) => {
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <Link
              href={`/chat/${c.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[72px] items-center gap-3 rounded-2xl p-3 transition",
                compact ? "hover:bg-white/5" : "glass hover:bg-white/10",
                active && "bg-rouge/10 ring-1 ring-inset ring-rouge/40",
              )}
            >
              <Avatar profile={p} size={compact ? 44 : 52} ring="rouge" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-semibold">{p.full_name.split(" ")[0]}</p>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(last?.created_at ?? c.responded_at ?? c.created_at)}</span>
                </div>
                <p className={cn("truncate text-sm", last && last.sender_id !== meId ? "text-primary" : "text-muted")}>
                  {last ? `${last.sender_id === meId ? "Vos: " : ""}${last.message_type === "image" ? "📷 Foto" : last.content}` : "¡Es un Match! Escribile primero 👋"}
                </p>
                <p className="truncate text-[11px] text-muted/70">{getEvent(state, c.event_id)?.name}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Panel derecho vacío de la vista dividida (PC) cuando no hay chat abierto. */
export function NoChatSelected() {
  return (
    <div className="flex h-full min-h-[60dvh] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 p-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-rouge/15 text-rouge shadow-glow-rouge">
        <MessageCircle className="size-7" />
      </span>
      <h2 className="text-xl">Elegí una conversación</h2>
      <p className="max-w-xs text-sm text-muted">Tus matches y chats quedan para siempre, aunque el lobby del evento haya cerrado.</p>
    </div>
  );
}
