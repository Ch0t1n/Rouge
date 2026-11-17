"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useParams } from "next/navigation";
import { UserX } from "lucide-react";
import { sendMessage } from "@/lib/engine/actions";
import { directMessages, getEvent, isBlockedBetween } from "@/lib/engine/selectors";
import { faceOf, verticalOf } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { profileHref } from "@/lib/engine/privacy";
import { displayStatus, meetingPlace, meetingPoint, meetingsOf } from "@/lib/engine/meetings";
import { formatTime } from "@/lib/utils";

/** Chat 1:1 entre matches. Sigue abierto aunque el lobby haya cerrado. */
export default function ChatPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Chat />;
}

function Chat() {
  const { connectionId } = useParams<{ connectionId: string }>();
  const { state, exec } = useRouge();
  const meId = state.current_user_id;
  const conn = state.connections.find((c) => c.id === connectionId);
  const otherId = conn ? (conn.sender_id === meId ? conn.receiver_id : conn.sender_id) : null;
  // La cara de la otra persona en el evento donde se conocieron (perfil profesional en corporativo).
  const other = conn ? faceOf(state, otherId, conn.event_id) : undefined;
  const v = verticalOf(state, conn?.event_id);
  const msgs = conn ? directMessages(state, conn.id) : [];

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

  return (
    <main className="flex min-h-dvh flex-col">
      <PageHeader
        backHref="/inbox"
        title={
          <Link href={profileHref(other, conn.event_id)} className="flex items-center gap-2">
            <Avatar profile={other} size={32} ring="rouge" /> {other.full_name.split(" ")[0]}
          </Link>
        }
        subtitle={`${v.copy.match} en ${getEvent(state, conn.event_id)?.name ?? "un evento"}`}
      />
      <div className="flex-1 px-4 pb-4 pt-2">
        {/* Reunión aceptada entre los dos: fijada arriba del chat con link al plano */}
        {meetingsOf(state, meId, conn.event_id)
          .filter((m) => m.connection_id === conn.id && displayStatus(m, Date.now()) === "accepted")
          .slice(0, 1)
          .map((m) => (
            <Link key={m.id} href={meetingPoint(state, m) ? `/map?meeting=${m.id}` : "/meetings"} className="mb-3 flex items-center gap-3 rounded-2xl border border-squad/40 bg-squad/[0.07] px-3 py-2.5 text-sm">
              <span className="text-xl" aria-hidden>📅</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Reunión {formatTime(m.starts_at)} · {m.duration_min} min</span>
                <span className="block truncate text-xs text-muted">{meetingPlace(state, m)} · {m.topic}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-squad">{meetingPoint(state, m) ? "Ver en el plano" : "Ver"}</span>
            </Link>
          ))}
        <p className="mx-auto mb-4 w-fit rounded-full bg-white/[0.05] px-3 py-1 text-center text-[11px] text-muted">
          {conn.type === "icebreaker" ? `⚡ Empezó con un${v.kind === "corporate" ? "a" : ""} ${v.copy.icebreaker}` : v.kind === "corporate" ? "🤝 Son contactos" : "💘 Hicieron Match"} · este chat no se borra al cerrar el lobby
        </p>
        <MessageList messages={msgs} meId={meId} profiles={new Map([[other.id, other]])} />
      </div>
      <Composer onSend={async (body) => (await exec(C.sendMessage(meId, { type: "direct", connectionId: conn.id }, body))).ok} />
    </main>
  );
}
