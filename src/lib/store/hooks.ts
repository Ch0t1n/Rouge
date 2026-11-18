"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { getProfile } from "@/lib/engine/selectors";
import { eventFeatures, type EventFeatureFlags } from "@/lib/engine/features";
import type { UUID } from "@/lib/types";
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

/** Módulos activos del evento (por defecto, el activo). La navegación, las rutas y el panel se adaptan a esto. */
export function useEventFeatures(eventId?: UUID | null): EventFeatureFlags {
  const { state } = useRouge();
  const id = eventId ?? state.active_event_id;
  const ev = state.events.find((e) => e.id === id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => eventFeatures(state, id), [id, ev?.features]);
}
