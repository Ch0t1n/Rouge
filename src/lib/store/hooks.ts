"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getProfile } from "@/lib/engine/selectors";
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
    else if (!me) router.replace(pathname === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [needsLogin, me, router, pathname]);
  return needsLogin ? undefined : me;
}
