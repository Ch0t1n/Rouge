"use client";

import { Suspense } from "react";
import { useRequireProfile } from "@/lib/store/hooks";
import { SquadAccounts } from "@/components/squad/SquadAccounts";

/** Cuentas de la mesa: quién pagó qué, saldos y transferencias mínimas (también en la columna derecha de /squad en PC). */
export default function SquadAccountsPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <Suspense>
      <SquadAccounts />
    </Suspense>
  );
}
