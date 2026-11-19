"use client";

import { useState } from "react";
import { Check, Heart, MessageCircle, UserPlus, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import { icebreakerEligibility } from "@/lib/engine/actions";
import { connectionBetween, connectionStateFor, getAttendee, isLobbyInteractive, getEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { useEventType } from "@/lib/store/hooks";
import { Button } from "@/components/ui/button";
import { IcebreakerComposer } from "./IcebreakerComposer";
import { useMatchCelebration } from "./MatchCelebration";
import { useConnect } from "./useConnect";

/** Conectar + Rompehielos para un perfil (usado en /u/[username]). */
export function ConnectActions({ target }: { target: Profile }) {
  const { state } = useRouge();
  const { type, copy } = useEventType();
  const ConnectIcon = type === "corporate" ? UserPlus : Heart;
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

  if (status === "matched" && match) {
    return (
      <>
        <Button block size="lg" onClick={() => router.push(`/chat/${match.id}`)}>
          <MessageCircle /> {type === "corporate" ? "Chatear · ya son contactos" : "Chatear · ya son Match"}
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
              <ConnectIcon className={type === "corporate" ? undefined : "fill-current"} /> Aceptar · {type === "corporate" ? "sumar contacto" : "es Match"}
            </>
          ) : (
            <>
              <ConnectIcon /> Conectar
            </>
          )}
        </Button>
        <Button size="lg" variant="outline" className="border-rouge/50 text-rouge" disabled={!!ice} onClick={() => setComposer(true)} aria-label="Enviar Rompehielos" title={ice ?? "Enviar Rompehielos"}>
          <Zap className="fill-current" /> Rompehielos
        </Button>
      </div>
      {mine.ghost_mode ? (
        <p className="text-center text-xs text-muted">Estás en Modo Solo Amigos: desactivalo en el lobby para conectar.</p>
      ) : status === "received" ? (
        <p className="text-center text-xs text-rouge">{target.full_name.split(" ")[0]} ya te conectó 👀</p>
      ) : ice && !/Solo Amigos/.test(ice) ? (
        <p className="text-center text-xs text-muted">{ice}</p>
      ) : (
        <p className="text-center text-xs text-muted">⚡ Te queda 1 Rompehielos {copy.today}</p>
      )}
      <IcebreakerComposer open={composer} onClose={() => setComposer(false)} target={target} eventId={eventId} />
      {celebration.element}
    </div>
  );
}
