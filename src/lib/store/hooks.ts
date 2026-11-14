"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "./RougeContext";

/**
 * Devuelve el perfil del usuario actual. Si todavía no creó su perfil
 * persistente, lo manda al onboarding (y devuelve undefined mientras redirige).
 */
export function useRequireProfile() {
  const { state } = useRouge();
  const router = useRouter();
  const me = getProfile(state, state.current_user_id);
  useEffect(() => {
    if (!me) router.replace("/onboarding");
  }, [me, router]);
  return me;
}
