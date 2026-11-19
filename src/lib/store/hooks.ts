"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { copyFor, eventTypeOf } from "@/lib/engine/eventType";
import { useRouge } from "./RougeContext";

/**
 * Devuelve el perfil del usuario actual.
 * - Supabase sin sesión → /login?next=<ruta actual>
 * - Sin perfil persistente → /onboarding?next=<ruta actual>
 * Devuelve undefined mientras redirige.
 */
export function useRequireProfile() {
  const { state, mode, signedIn } = useRouge();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const me = getProfile(state, state.current_user_id);
  const needsLogin = mode === "supabase" && !signedIn;
  useEffect(() => {
    if (needsLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!me) router.replace(pathname === "/app" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [needsLogin, me, router, pathname]);
  return needsLogin ? undefined : me;
}

/** Tipo del evento activo (fiesta o corporativo) y su vocabulario ("Match" / "Contacto", "Line-up" / "Agenda"…). */
export function useEventType() {
  const { state } = useRouge();
  const type = eventTypeOf(activeEvent(state));
  return { type, copy: copyFor(type) };
}
