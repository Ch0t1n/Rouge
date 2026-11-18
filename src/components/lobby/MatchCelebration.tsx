"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import type { UUID } from "@/lib/types";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { faceOf, verticalOf } from "@/lib/engine/verticals";

/** Overlay "¡Es un Match!" — se usa desde la grilla, el perfil y la bandeja. */
export function useMatchCelebration() {
  const [conn, setConn] = useState<{ id: UUID; otherId: UUID } | null>(null);
  const show = useCallback((connectionId: UUID, otherId: UUID) => setConn({ id: connectionId, otherId }), []);
  const element = conn ? <MatchOverlay connectionId={conn.id} otherId={conn.otherId} onClose={() => setConn(null)} /> : null;
  return { show, element };
}

function MatchOverlay({ connectionId, otherId, onClose }: { connectionId: UUID; otherId: UUID; onClose: () => void }) {
  const { state } = useRouge();
  const router = useRouter();
  const me = faceOf(state, state.current_user_id);
  const other = faceOf(state, otherId);
  if (!me || !other) return null;
  const pro = verticalOf(state, state.active_event_id).kind === "corporate";
  return (
    <div role="dialog" aria-modal="true" aria-label={`Match con ${other.full_name}`} className="fixed inset-0 z-[70] mx-auto flex max-w-md flex-col items-center justify-center gap-8 bg-background/95 px-8 text-center backdrop-blur-xl animate-in fade-in">
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rouge/25 blur-[100px]" />
      </div>
      <p className="relative font-display text-5xl font-bold leading-none tracking-tight text-rouge text-glow-rouge animate-neon-flicker">{pro ? "¡Nuevo contacto!" : "¡Es un Match!"}</p>
      <div className="relative flex items-center">
        <Avatar profile={me} size={112} ring="rouge" className="-rotate-6" />
        <span className="z-10 -mx-4 grid size-12 place-items-center rounded-full bg-rouge text-2xl shadow-glow-rouge">{pro ? "🤝" : "🔥"}</span>
        <Avatar profile={other} size={112} ring="rouge" className="rotate-6" />
      </div>
      <p className="relative text-primary/90">
        Vos y <b>{other.full_name.split(" ")[0]}</b> se conectaron. El chat queda abierto aunque cierre el lobby.
      </p>
      <div className="relative w-full space-y-2">
        <Button
          block
          size="lg"
          onClick={() => {
            onClose();
            router.push(`/chat/${connectionId}`);
          }}
        >
          <MessageCircle /> Escribile
        </Button>
        <Button block variant="ghost" onClick={onClose}>
          Seguir mirando
        </Button>
      </div>
    </div>
  );
}
