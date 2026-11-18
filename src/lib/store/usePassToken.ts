"use client";

import { useEffect, useState } from "react";
import type { UUID } from "@/lib/types";
import { demoPassToken, passSecondsLeft, passValue, passWindow } from "@/lib/engine/door";
import { getSupabase } from "@/lib/supabase/client";
import { useNow, useRouge } from "./RougeContext";

export interface PassToken {
  /** Lo que codifica el QR de acceso (null mientras se pide el primero al servidor). */
  value: string | null;
  /** QR rotativo (el evento tiene `dynamic_pass`). */
  dynamic: boolean;
  /** Segundos hasta el próximo cambio (solo rotativo). */
  secondsLeft: number | null;
  /** No se pudo renovar (sin señal): el QR en pantalla puede estar vencido. */
  stale: boolean;
}

/**
 * Pase de acceso de quien usa la app en `eventId`. Sin `dynamic_pass`: el pase fijo de siempre (`ROUGE:PASS:…`).
 * Con `dynamic_pass`: un token que cambia cada 30 s — en Supabase lo firma el servidor (`my_pass_token`, secreto por
 * evento que el cliente nunca ve); en el Modo Demo se simula en el motor (`demoPassToken`).
 */
export function usePassToken(eventId: UUID | null | undefined): PassToken | null {
  const { state, mode } = useRouge();
  const me = state.current_user_id;
  const dynamic = !!state.events.find((e) => e.id === eventId)?.dynamic_pass;
  const now = useNow(dynamic ? 1000 : 60_000);
  const window = passWindow(now);
  const [remote, setRemote] = useState<{ eventId: UUID; window: number; token: string } | null>(null);
  const [failed, setFailed] = useState(false);

  // Supabase: un token nuevo por ventana de 30 s (y al volver a tener señal, en la ventana siguiente).
  useEffect(() => {
    if (!dynamic || mode !== "supabase" || !eventId) return;
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    sb.rpc("my_pass_token", { p_event: eventId }).then(({ data, error }) => {
      if (!alive) return;
      const d = data as { token?: string; window?: number } | null;
      if (error || !d?.token) {
        setFailed(true);
        return;
      }
      setRemote({ eventId, window: d.window ?? window, token: d.token });
      setFailed(false);
    });
    return () => {
      alive = false;
    };
  }, [dynamic, mode, eventId, window]);

  if (!eventId || !me) return null;
  if (!dynamic) return { value: passValue(eventId, me), dynamic: false, secondsLeft: null, stale: false };
  if (mode !== "supabase") return { value: demoPassToken(eventId, me, now), dynamic: true, secondsLeft: passSecondsLeft(now), stale: false };
  const token = remote?.eventId === eventId ? remote.token : null;
  return { value: token, dynamic: true, secondsLeft: passSecondsLeft(now), stale: failed };
}
