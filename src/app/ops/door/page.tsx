"use client";

import { DoorScanner } from "@/components/admin/DoorScanner";
import { ReportsPanel } from "@/components/admin/ReportsPanel";
import { SecurityPanel } from "@/components/admin/SecurityPanel";
import { activeEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";

/** Puerta (plataforma operativa): escáner a pantalla completa, alto contraste, con alertas de rescate y reportes. */
export default function OpsDoorPage() {
  const { state } = useRouge();
  const event = activeEvent(state)!;
  return (
    <>
      <DoorScanner variant="ops" />
      <div className="mx-auto grid max-w-5xl gap-5 px-5 pb-10 lg:grid-cols-2">
        <SecurityPanel event={event} />
        <ReportsPanel event={event} dark />
      </div>
    </>
  );
}
