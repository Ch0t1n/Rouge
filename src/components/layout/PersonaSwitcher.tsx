"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, UserRoundCog, UserRoundPlus } from "lucide-react";
import { MOOD_TAGS } from "@/lib/types";
import { getAttendee } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { Avatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROLE_META, roleHome, staffRoleOf } from "@/lib/engine/roles";

/**
 * Solo Modo Demo y tras entrar por /demo: "actuar como" cualquier asistente para probar ambos lados
 * de un flujo (enviar conexión ↔ recibirla, rescate ↔ alerta). Combinado con
 * dos pestañas abiertas simula el realtime entre teléfonos.
 */
export function PersonaSwitcher() {
  const { state, mode, demoVisible, setCurrentUser, startNewPersona, resetDemo, notify } = useRouge();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (mode !== "demo" || !demoVisible) return null;
  const me = state.profiles.find((p) => p.id === state.current_user_id);
  // Asistentes del evento + personas creadas en el demo; el equipo va aparte (entra a su panel)
  const roleFor = (id: string) => staffRoleOf(state, state.active_event_id, id);
  const people = state.profiles.filter((p) => !roleFor(p.id));
  const team = state.profiles.filter((p) => roleFor(p.id));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex min-h-touch items-center gap-2 rounded-full py-1 pl-1 pr-3"
        aria-label="Cambiar de persona (Modo Demo)"
      >
        {me && <Avatar profile={me} size={34} ring="rouge" />}
        <UserRoundCog className="size-4 text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Actuar como…"
        description="Modo Demo: cambiá de persona para probar cada lado de los flujos. Abrí otra pestaña para simular un segundo teléfono."
        footer={
          <div className="grid grid-cols-2 gap-2">
          <Button
            variant="glass"
            onClick={() => {
              startNewPersona();
              setOpen(false);
              router.push("/onboarding");
            }}
          >
            <UserRoundPlus /> Persona nueva
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              resetDemo();
              setOpen(false);
              notify({ tone: "info", title: "Demo reiniciado", description: "Datos precargados restaurados." });
            }}
          >
            <RotateCcw /> Reiniciar demo
          </Button>
          </div>
        }
      >
        <ul className="space-y-1.5">
          {people.map((p) => {
            const att = getAttendee(state, state.active_event_id, p.id);
            const mood = MOOD_TAGS.find((m) => m.id === att?.mood_tag);
            const active = p.id === state.current_user_id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentUser(p.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-touch w-full items-center gap-3 rounded-2xl p-2 text-left transition",
                    active ? "bg-rouge/15 ring-1 ring-rouge/40" : "hover:bg-white/5",
                  )}
                >
                  <Avatar profile={p} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.full_name} <span className="font-normal text-muted">@{p.username}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {att ? (mood ? `${mood.emoji} ${mood.label}` : "Sin mood") : "Fuera del evento"} · {p.music_genres.join(", ") || "sin géneros"}
                    </p>
                  </div>
                  {att?.ghost_mode && <Badge>Ghost</Badge>}
                  {active && <Badge tone="rouge">Vos</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
        {team.length > 0 && (
          <>
            <p className="mb-2 mt-5 font-display text-xs font-semibold uppercase tracking-widest text-vip">Equipo del evento</p>
            <ul className="space-y-1.5">
              {team.map((p) => {
                const r = roleFor(p.id)!;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentUser(p.id);
                        setOpen(false);
                        router.push(roleHome(r));
                      }}
                      className="flex min-h-touch w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/5"
                    >
                      <span className="grid size-10 place-items-center rounded-full bg-vip/15 text-lg" aria-hidden>
                        {ROLE_META[r].emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.full_name}</p>
                        <p className="truncate text-xs text-muted">{ROLE_META[r].description}</p>
                      </div>
                      <Badge tone="vip">{ROLE_META[r].label}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </BottomSheet>
    </>
  );
}
