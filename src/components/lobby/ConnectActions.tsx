"use client";

import { useState } from "react";
import { Check, Heart, MessageCircle, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import { icebreakerEligibility } from "@/lib/engine/actions";
import { connectionBetween, connectionStateFor, getAttendee, isLobbyInteractive, getEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { Button } from "@/components/ui/button";
import { verticalOf } from "@/lib/engine/verticals";
import { IcebreakerComposer } from "./IcebreakerComposer";
import { useMatchCelebration } from "./MatchCelebration";
import { useConnect } from "./useConnect";

/** Conectar + Rompehielos para un perfil (usado en /u/[username]). */
export function ConnectActions({ target }: { target: Profile }) {
  const { state } = useRouge();
  const router = useRouter();
  const [composer, setComposer] = useState(false);
  const celebration = useMatchCelebration();
  const doConnect = useConnect(celebration.show);
  const me = state.current_user_id;
  const eventId = state.active_event_id;
  const event = getEvent(state, eventId);
  const mine = getAttendee(state, eventId, me);
  const theirs = getAttendee(state, eventId, target.id);
  const status = connectionStateFor(state, eventId, me, target.id);
  const match = connectionBetween(state, eventId, me, target.id).find((c) => c.status === "accepted");
  const v = verticalOf(state, eventId);

  if (status === "matched" && match) {
    return (
      <>
        <Button block size="lg" onClick={() => router.push(`/chat/${match.id}`)}>
          <MessageCircle /> Chatear · ya son {v.copy.match}
        </Button>
        {celebration.element}
      </>
    );
  }
  if (!mine || !theirs || !event || !isLobbyInteractive(event)) return null;

  const ice = icebreakerEligibility(state, eventId, me, target.id);
  const connect = () => doConnect(target);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={connect} disabled={status === "sent" || mine.ghost_mode} variant={status === "sent" ? "glass" : "rouge"}>
          {status === "sent" ? (
            <>
              <Check /> Solicitud enviada
            </>
          ) : status === "received" ? (
            <>
              <Heart className="fill-current" /> Aceptar · es {v.copy.match}
            </>
          ) : (
            <>
              <Heart /> Conectar
            </>
          )}
        </Button>
        <Button size="lg" variant="outline" className="border-rouge/50 text-rouge" disabled={!!ice} onClick={() => setComposer(true)} aria-label={`Enviar ${v.copy.icebreaker}`} title={ice ?? `Enviar ${v.copy.icebreaker}`}>
          <Zap className="fill-current" /> {v.copy.icebreaker}
        </Button>
      </div>
      {mine.ghost_mode ? (
        <p className="text-center text-xs text-muted">Estás en {v.copy.ghost}: desactivalo en el lobby para conectar.</p>
      ) : status === "received" ? (
        <p className="text-center text-xs text-rouge">{target.full_name.split(" ")[0]} ya te conectó 👀</p>
      ) : ice && !/Solo Amigos/.test(ice) ? (
        <p className="text-center text-xs text-muted">{ice}</p>
      ) : (
        <p className="text-center text-xs text-muted">⚡ Te queda 1 {v.copy.icebreaker} {v.kind === "corporate" ? "en este evento" : "esta noche"}</p>
      )}
      <IcebreakerComposer open={composer} onClose={() => setComposer(false)} target={target} eventId={eventId} />
      {celebration.element}
    </div>
  );
}
