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
import { ConversationList } from "@/components/chat/ConversationList";
import { ProfileView } from "@/components/profile/ProfileView";

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
      <SplitView>
        <main>
          <PageHeader title="Chat" backHref="/inbox" />
          <div className="flex flex-col items-center gap-3 px-8 pt-24 text-center">
            <UserX className="size-10 text-muted" />
            <h2 className="text-xl">Esta conversación no está disponible</h2>
          </div>
        </main>
      </SplitView>
    );
  }

  return (
    <SplitView activeId={conn.id} contact={<ProfileView profile={other} mood={null} affinity={null} />}>
    <main className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0 lg:overflow-y-auto">
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
    </SplitView>
  );
}

/**
 * PC (≥ 1024px): vista dividida — conversaciones a la izquierda (35%) y el chat activo a la derecha (65%),
 * con el perfil del contacto en una tercera columna en pantallas anchas (≥ 1280px). En móvil, solo el chat.
 */
function SplitView({ activeId, contact, children }: { activeId?: string; contact?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(300px,35%)_1fr]">
      <aside aria-label="Conversaciones" className="hidden overflow-y-auto border-r border-white/10 lg:block">
        <div className="sticky top-0 z-10 flex items-baseline justify-between bg-background/85 px-4 pb-3 pt-6 backdrop-blur-xl">
          <h2 className="text-2xl">Chats</h2>
          <Link href="/inbox" className="text-xs font-semibold text-rouge hover:underline">Solicitudes →</Link>
        </div>
        <div className="px-2 pb-6">
          <ConversationList activeId={activeId} compact />
        </div>
      </aside>
      <div className={contact ? "xl:grid xl:h-dvh xl:grid-cols-[1fr_320px]" : undefined}>
        {children}
        {contact && (
          <aside aria-label="Perfil del contacto" className="hidden overflow-y-auto border-l border-white/10 px-4 py-6 xl:block">
            {contact}
          </aside>
        )}
      </div>
    </div>
  );
}
