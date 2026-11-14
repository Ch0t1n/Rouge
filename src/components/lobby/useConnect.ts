"use client";

import { useCallback } from "react";
import type { Profile } from "@/lib/types";
import { respondConnection, sendConnection } from "@/lib/engine/actions";
import { connectionBetween } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";

/**
 * Conectar con alguien. Si ya te había conectado, acepta su solicitud
 * (match inmediato). Devuelve el id de la conexión si hubo match.
 */
export function useConnect(onMatch: (connectionId: string, otherId: string) => void) {
  const { state, run, notify } = useRouge();
  return useCallback(
    (target: Profile) => {
      const me = state.current_user_id;
      const eventId = state.active_event_id;
      const incoming = connectionBetween(state, eventId, me, target.id).find((c) => c.status === "pending" && c.receiver_id === me);
      if (incoming) {
        const r = run((s) => respondConnection(s, incoming.id, me, true));
        if (r.ok) onMatch(r.data.id, target.id);
        return;
      }
      const r = run((s) => sendConnection(s, eventId, me, target.id));
      if (!r.ok) return;
      if (r.data.matched) onMatch(r.data.connection.id, target.id);
      else notify({ tone: "rouge", title: `💘 Le diste Conectar a ${target.full_name.split(" ")[0]}`, description: "Si te conecta de vuelta, es Match.", duration: 2600 });
    },
    [state, run, notify, onMatch],
  );
}
