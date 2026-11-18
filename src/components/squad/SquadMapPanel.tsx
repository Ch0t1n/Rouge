"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2 } from "lucide-react";
import { activeEvent, squadOf, visiblePins } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { VenueMap } from "@/components/venue/VenueMap";

/** Plano compacto del Squad (columna izquierda de /squad en PC): pines visibles y Punto Base, en vivo. */
export function SquadMapPanel() {
  const { state } = useRouge();
  const router = useRouter();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const mine = squadOf(state, event.id, meId);
  const pins = visiblePins(state, event.id, meId, now);
  return (
    <section aria-label="Plano del Squad" className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <h2 className="text-base">Plano en vivo</h2>
        <Link href="/map" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-squad hover:bg-squad/10">
          <Maximize2 className="size-3.5" /> Abrir
        </Link>
      </div>
      <VenueMap
        compact
        layout={event.venue_layout_json}
        mapImageUrl={event.venue_map_url}
        pins={pins}
        basePin={mine?.squad.base_pin_x != null ? { x: mine.squad.base_pin_x, y: mine.squad.base_pin_y!, label: mine.squad.base_pin_label ?? "Punto Base" } : null}
        onPinClick={(vp) => router.push(`/map?focus=${vp.profile.id}`)}
      />
      <p className="px-4 py-2 text-[11px] text-muted">Tocá un pin para verlo en el plano completo.</p>
    </section>
  );
}
