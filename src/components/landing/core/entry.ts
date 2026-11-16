"use client";

import { useOptionalRouge } from "@/lib/store/RougeContext";
import { destinationFor } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";

/**
 * Destinos de los CTAs de la landing (pantalla principal, pensada para el público real):
 * - Asistente: con sesión va a su pantalla; si no, a ingresar el código o link de su entrada (/join).
 * - Equipo: con sesión de staff va directo; si no, al login de equipo con `next`.
 * Nada de atajos de demo acá: la demo para anfitriones vive en /demo.
 * Antes de hidratar el estado (HTML del servidor, lo que leen los buscadores) usa los destinos públicos.
 */
export function useEntry() {
  const ctx = useOptionalRouge();
  if (!ctx) return { mode: null, loggedIn: false, appHref: "/join", staffHref: staffLogin, eventName: null };
  const { state, mode, signedIn, isStaff } = ctx;
  const me = getProfile(state, state.current_user_id);
  const loggedIn = mode === "supabase" && signedIn && !!me;
  const ev = state.active_event_id;

  const appHref = loggedIn ? destinationFor(state, ev, state.current_user_id, null) : "/join";
  const staffHref = (next: string) => (loggedIn && isStaff ? next : staffLogin(next));
  // El "EN VIVO: <evento>" solo con eventos reales (en el sitio de demostración sería la fiesta de ejemplo).
  const eventName = mode === "supabase" ? (state.events.find((e) => e.id === ev)?.name ?? null) : null;

  return { mode, loggedIn, appHref, staffHref, eventName };
}

function staffLogin(next: string) {
  return `/login?as=staff&next=${encodeURIComponent(next)}`;
}
