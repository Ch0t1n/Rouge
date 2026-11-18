"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { roleHome } from "@/lib/engine/roles";
import { useRouge } from "@/lib/store/RougeContext";

/** /ops → la pantalla operativa de cada rol (puerta o barra). */
export default function OpsHome() {
  const { role } = useRouge();
  const router = useRouter();
  useEffect(() => {
    router.replace(role === "bartender" || role === "waiter" ? "/ops/bar" : role === "security" ? "/ops/door" : role === "owner" || role === "manager" ? "/ops/door" : roleHome(role));
  }, [role, router]);
  return null;
}
