"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { ordersOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { Button } from "@/components/ui/button";

const supported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

/**
 * Cola virtual: cuando la barra marca un pedido como "Listo para retirar", el teléfono muestra una notificación del
 * sistema (Service Worker) aunque la app esté en segundo plano. Con la app cerrada del todo hace falta Web Push del
 * servidor (VAPID); este aviso cubre la noche con la PWA abierta o minimizada.
 */
export function ReadyAlerts() {
  const { state } = useRouge();
  const seen = useRef<Set<string> | null>(null);
  const ready = ordersOf(state, state.current_user_id, state.active_event_id).filter((o) => o.status === "ready_qr" || o.status === "delivering");
  useEffect(() => {
    const ids = new Set(ready.map((o) => o.id));
    if (seen.current === null) {
      seen.current = ids; // lo que ya estaba listo al abrir no se vuelve a avisar
      return;
    }
    const fresh = ready.filter((o) => !seen.current!.has(o.id));
    seen.current = ids;
    if (!fresh.length || !supported() || Notification.permission !== "granted") return;
    void navigator.serviceWorker.ready.then((reg) => {
      for (const o of fresh)
        void reg.showNotification(o.status === "delivering" ? "🛵 Tu pedido va en camino" : "🍸 ¡Tu pedido está listo!", {
          body: `${o.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ")}${o.pickup_code ? ` · código ${o.pickup_code}` : ""}`,
          tag: `order-${o.id}`,
          icon: "/icons/icon-192.png",
          data: { url: "/bar" },
        });
    });
  }, [ready]);
  return null;
}

/** Botón para activar los avisos del sistema (una vez por dispositivo). */
export function EnableReadyAlerts() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => setPerm(supported() ? Notification.permission : "unsupported"), []);
  if (perm === "unsupported" || perm === "granted") return null;
  return (
    <Button size="sm" variant="glass" disabled={perm === "denied"} onClick={async () => setPerm(await Notification.requestPermission())}>
      <BellRing /> {perm === "denied" ? "Avisos bloqueados en el navegador" : "Avisarme cuando esté listo"}
    </Button>
  );
}
