"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useParams } from "next/navigation";
import { UserX } from "lucide-react";
import { sendMessage } from "@/lib/engine/actions";
import { directMessages, getEvent, getProfile, isBlockedBetween } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";

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
  const other = getProfile(state, otherId);
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
          <Link href={`/u/${other.username}`} className="flex items-center gap-2">
            <Avatar profile={other} size={32} ring="rouge" /> {other.full_name.split(" ")[0]}
          </Link>
        }
        subtitle={`Match en ${getEvent(state, conn.event_id)?.name ?? "un evento"}`}
      />
      <div className="flex-1 px-4 pb-4 pt-2">
        <p className="mx-auto mb-4 w-fit rounded-full bg-white/[0.05] px-3 py-1 text-center text-[11px] text-muted">
          {conn.type === "icebreaker" ? "⚡ Empezó con un Rompehielos" : "💘 Hicieron Match"} · este chat no se borra al cerrar el lobby
        </p>
        <MessageList messages={msgs} meId={meId} profiles={new Map([[other.id, other]])} />
      </div>
      <Composer onSend={async (body) => (await exec(C.sendMessage(meId, { type: "direct", connectionId: conn.id }, body))).ok} />
    </main>
  );
}
