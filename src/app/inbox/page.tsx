"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, X, Zap } from "lucide-react";
import type { Connection, Profile } from "@/lib/types";
import { computeAffinity } from "@/lib/engine/affinity";
import { respondConnection } from "@/lib/engine/actions";
import { directMessages, getAttendee, getEvent, getProfile, inboxOf, matchesOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, timeAgo } from "@/lib/utils";
import { useMatchCelebration } from "@/components/lobby/MatchCelebration";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function InboxPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Inbox />;
}

function Inbox() {
  const { state, exec, notify } = useRouge();
  const router = useRouter();
  const meId = state.current_user_id;
  const eventId = state.active_event_id;
  const me = getProfile(state, meId)!;
  const celebration = useMatchCelebration();
  const requests = inboxOf(state, meId, eventId);
  const [tab, setTab] = useState<"requests" | "matches">(requests.length ? "requests" : "matches");

  // Matches de TODOS los eventos: sobreviven a la caducidad del lobby.
  const matches = useMemo(
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
  const sent = state.connections.filter((c) => c.event_id === eventId && c.sender_id === meId && c.status === "pending");

  const respond = async (c: Connection, other: Profile, accept: boolean, thenChat = false) => {
    const r = await exec(C.respondConnection(c.id, meId, accept));
    if (!r.ok) return;
    if (!accept) {
      notify({ tone: "info", title: c.type === "icebreaker" ? "Rompehielos ignorado" : "Solicitud rechazada", description: "No le avisamos.", duration: 2200 });
      return;
    }
    if (thenChat) router.push(`/chat/${c.id}`);
    else celebration.show(c.id, other.id);
  };

  return (
    <main className="safe-top">
      <header className="sticky top-0 z-30 bg-background/85 px-4 pb-2 pt-4 backdrop-blur-xl">
        <h1 className="text-2xl">Bandeja</h1>
        <div role="tablist" className="mt-3 grid grid-cols-2 rounded-2xl bg-white/[0.05] p-1">
          {(
            [
              ["requests", `Solicitudes${requests.length ? ` · ${requests.length}` : ""}`],
              ["matches", `Matches · ${matches.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn("min-h-[40px] rounded-xl font-display text-sm font-semibold transition", tab === key ? "bg-rouge text-white shadow-glow-rouge" : "text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-3 px-4 pb-8 pt-2">
        {tab === "requests" && (
          <>
            {requests.length === 0 && <EmptyNote>No tenés solicitudes nuevas. Conectá desde la grilla del lobby 💘</EmptyNote>}
            {requests.map(({ connection: c, profile: p }) => {
              const att = getAttendee(state, eventId, p.id);
              const aff = att ? computeAffinity(me, getAttendee(state, eventId, meId), p, att) : null;
              const drink = c.attached_drink_qr_id ? state.user_perks_qrs.find((q) => q.id === c.attached_drink_qr_id) : undefined;
              if (c.type === "icebreaker") {
                return (
                  <article key={c.id} className="relative overflow-hidden rounded-3xl border border-rouge/50 bg-rouge/[0.08] p-4 shadow-glow-rouge">
                    <p className="mb-3 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-rouge">
                      <Zap className="size-3.5 fill-current" /> Rompehielos · fijado
                    </p>
                    <div className="flex gap-3">
                      <Link href={`/u/${p.username}`}>
                        <Avatar profile={p} size={52} ring="rouge" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {p.full_name.split(" ")[0]} <span className="font-normal text-muted">· {timeAgo(c.created_at)}</span>
                        </p>
                        <p className="mt-1 rounded-2xl rounded-tl-md bg-black/30 px-3 py-2 text-[15px] leading-snug">{c.icebreaker_message}</p>
                        {drink && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-vip/15 px-2.5 py-1 font-display text-xs font-bold text-vip ring-1 ring-inset ring-vip/40">
                            🎁 Te regaló: {drink.title.replace(/\s—\s.*$/, "")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                      <Button onClick={() => respond(c, p, true, true)}>
                        <MessageCircle /> Aceptar y responder
                      </Button>
                      <Button variant="ghost" onClick={() => respond(c, p, false)}>
                        Ignorar
                      </Button>
                    </div>
                  </article>
                );
              }
              return (
                <article key={c.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                  <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar profile={p} size={52} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.full_name.split(" ")[0]} te dio Conectar</p>
                      <p className="truncate text-xs text-muted">
                        {aff ? `${aff.musicPercent}% afinidad · ` : ""}
                        {timeAgo(c.created_at)}
                      </p>
                    </div>
                  </Link>
                  <button type="button" aria-label={`Rechazar a ${p.full_name}`} onClick={() => respond(c, p, false)} className="grid size-11 place-items-center rounded-full bg-white/[0.06] text-muted hover:text-primary">
                    <X className="size-5" />
                  </button>
                  <button type="button" aria-label={`Aceptar a ${p.full_name}`} onClick={() => respond(c, p, true)} className="grid size-11 place-items-center rounded-full bg-rouge text-white shadow-glow-rouge">
                    <Heart className="size-5 fill-current" />
                  </button>
                </article>
              );
            })}
            {sent.length > 0 && (
              <section className="pt-4">
                <h2 className="mb-2 text-sm text-muted">Enviadas · esperando respuesta</h2>
                <div className="no-scrollbar flex gap-3 overflow-x-auto">
                  {sent.map((c) => {
                    const p = getProfile(state, c.receiver_id);
                    return p ? (
                      <Link key={c.id} href={`/u/${p.username}`} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
                        <Avatar profile={p} size={52} className={c.type === "icebreaker" ? "ring-2 ring-rouge" : "opacity-80"} />
                        <span className="w-full truncate text-[11px] text-muted">{c.type === "icebreaker" ? "⚡ " : ""}{p.full_name.split(" ")[0]}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "matches" && (
          <>
            {matches.length === 0 && <EmptyNote>Todavía no tenés matches. Cuando alguien te conecte de vuelta, aparece acá para siempre.</EmptyNote>}
            {matches.map(({ connection: c, profile: p, last }) => (
              <Link key={c.id} href={`/chat/${c.id}`} className="glass flex min-h-[72px] items-center gap-3 rounded-2xl p-3 transition hover:bg-white/10">
                <Avatar profile={p} size={52} ring="rouge" />
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
            ))}
          </>
        )}
      </div>
      {celebration.element}
    </main>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">{children}</p>;
}
