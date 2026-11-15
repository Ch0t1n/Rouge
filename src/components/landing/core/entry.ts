"use client";

import { useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useRouge } from "@/lib/store/RougeContext";
import { destinationFor, staffRoleOf } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";

/**
 * Destinos de los CTAs de la landing hacia la PWA y el panel, según el modo:
 * - Demo: "Probar la app" abre /app con la persona activa; los accesos al panel entran como el
 *   dueño/a o producción del evento demo (un clic, sin pasar por el selector de rol).
 * - Supabase: con sesión va a su pantalla; sin sesión, al login del tipo de usuario con `next`.
 */
export function useEntry() {
  const { state, mode, signedIn, isStaff, setCurrentUser } = useRouge();
  const router = useRouter();
  const me = getProfile(state, state.current_user_id);
  const loggedIn = mode === "supabase" && signedIn && !!me;
  const ev = state.active_event_id;

  const appHref = mode === "demo" ? "/app" : loggedIn ? destinationFor(state, ev, state.current_user_id, null) : "/login";

  const staffHref = (next: string) => (mode === "supabase" && loggedIn && isStaff ? next : `/login?as=staff&next=${encodeURIComponent(next)}`);

  /** onClick para links al panel: en demo cambia a una persona con permisos y navega directo. */
  const staffClick = useCallback(
    (next: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      if (mode !== "demo" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const pick = (roles: string[]) => state.profiles.find((p) => roles.includes(staffRoleOf(state, ev, p.id) ?? ""));
      const needsBar = next.startsWith("/admin/bar-pos");
      const who = pick(needsBar ? ["owner", "manager", "bartender"] : ["owner", "manager"]);
      if (!who) return; // sin staff en el demo: que decida el login
      e.preventDefault();
      setCurrentUser(who.id);
      router.push(next);
    },
    [mode, state, ev, setCurrentUser, router],
  );

  return { mode, loggedIn, appHref, staffHref, staffClick, eventName: state.events.find((e) => e.id === ev)?.name ?? null };
}
