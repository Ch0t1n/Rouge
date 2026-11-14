"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Send, UserX } from "lucide-react";
import { sendMessage } from "@/lib/engine/actions";
import { directMessages, getEvent, getProfile, isBlockedBetween } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, formatTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Chat 1:1 entre matches. Sigue abierto aunque el lobby haya cerrado. */
export default function ChatPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Chat />;
}

function Chat() {
  const { connectionId } = useParams<{ connectionId: string }>();
  const { state, run } = useRouge();
  const meId = state.current_user_id;
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const conn = state.connections.find((c) => c.id === connectionId);
  const otherId = conn ? (conn.sender_id === meId ? conn.receiver_id : conn.sender_id) : null;
  const other = getProfile(state, otherId);
  const msgs = conn ? directMessages(state, conn.id) : [];

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const allowed = !!conn && conn.status === "accepted" && (conn.sender_id === meId || conn.receiver_id === meId) && !!other && !isBlockedBetween(state, meId, other.id);
  if (!allowed || !other) {
    return (
      <main>
        <PageHeader title="Chat" backHref="/inbox" />
        <div className="flex flex-col items-center gap-3 px-8 pt-24 text-center">
          <UserX className="size-10 text-muted" />
          <h2 className="text-xl">Esta conversación no está disponible</h2>
        </div>
      </main>
    );
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const r = run((s) => sendMessage(s, meId, { type: "direct", connectionId: conn.id }, { content: text }));
    if (r.ok) setText("");
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <PageHeader
        backHref="/inbox"
        title={
          <Link href={`/u/${other.username}`} className="flex items-center gap-2">
            <Avatar profile={other} size={32} ring="rouge" /> {other.full_name.split(" ")[0]}
          </Link>
        }
        subtitle={`Match en ${getEvent(state, conn.event_id)?.name ?? "un evento"}`}
      />
      <div className="flex-1 space-y-2 px-4 pb-4 pt-2">
        <p className="mx-auto mb-4 w-fit rounded-full bg-white/[0.05] px-3 py-1 text-center text-[11px] text-muted">
          {conn.type === "icebreaker" ? "⚡ Empezó con un Rompehielos" : "💘 Hicieron Match"} · este chat no se borra al cerrar el lobby
        </p>
        {msgs.map((m, i) => {
          const mine = m.sender_id === meId;
          const showTime = i === msgs.length - 1 || msgs[i + 1].sender_id !== m.sender_id;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <p className={cn("max-w-[80%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-snug", mine ? "rounded-br-md bg-rouge text-white" : "rounded-bl-md bg-surface-raised text-primary")}>
                {m.content}
              </p>
              {showTime && <span className="mt-1 px-2 text-[10px] text-muted">{formatTime(m.created_at)}</span>}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="sticky bottom-0 flex items-end gap-2 border-t border-white/10 bg-background/90 px-3 pb-[max(0.75rem,var(--safe-bottom))] pt-3 backdrop-blur-xl">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí un mensaje…"
          aria-label="Mensaje"
          maxLength={1000}
          className="min-h-touch flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[15px] placeholder:text-muted/60 focus:border-rouge/50 focus:outline-none"
        />
        <Button type="submit" size="icon" aria-label="Enviar" disabled={!text.trim()}>
          <Send />
        </Button>
      </form>
    </main>
  );
}
