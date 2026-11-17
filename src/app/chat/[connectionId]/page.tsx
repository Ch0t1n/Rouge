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
import { ConversationList } from "@/components/chat/ConversationList";
import { ProfileView } from "@/components/profile/ProfileView";
import { GiftDrinkButton } from "@/components/monetization/GiftDrinkButton";
import { isLobbyInteractive } from "@/lib/engine/selectors";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { profileHref } from "@/lib/engine/privacy";
import { displayStatus, meetingPlace, meetingPoint, meetingsOf } from "@/lib/engine/meetings";
import { formatTime } from "@/lib/utils";

/** Chat 1:1 entre matches. Sigue abierto aunque el lobby haya cerrado. */
export default function ChatPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
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

  const params = useSearchParams();
  const ev = conn ? getEvent(state, conn.event_id) : undefined;
  const giftable = !!ev && isLobbyInteractive(ev, Date.now());
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
          <Link href={profileHref(other, conn.event_id)} className="flex items-center gap-2">
            <Avatar profile={other} size={32} ring="rouge" /> {other.full_name.split(" ")[0]}
          </Link>
        }
        subtitle={`${v.copy.match} en ${getEvent(state, conn.event_id)?.name ?? "un evento"}`}
        action={giftable ? <GiftDrinkButton connectionId={conn.id} toName={other.full_name.split(" ")[0]} autoOpen={params.get("regalo") === "1"} /> : undefined}
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
