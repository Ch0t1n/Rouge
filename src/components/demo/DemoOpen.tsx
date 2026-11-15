"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { safeNext } from "@/lib/engine/roles";
import { DEMO_ROLES, type DemoRole } from "@/lib/demo/script";

/** /demo/abrir?rol=barra&a=/admin/bar-pos → esta pestaña pasa a ser esa persona y va a esa pantalla (solo demo). */
export function DemoOpen() {
  const { mode, setCurrentUser } = useRouge();
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (mode !== "demo") {
      router.replace("/login");
      return;
    }
    const role = DEMO_ROLES[params.get("rol") as DemoRole];
    if (role) setCurrentUser(role.id);
    router.replace(safeNext(params.get("a")) ?? role?.home ?? "/demo");
  }, [mode, params, router, setCurrentUser]);

  return (
    <main className="grid min-h-dvh place-items-center">
      <Loader2 className="size-6 animate-spin text-rouge" aria-label="Abriendo" />
    </main>
  );
}
