"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DoorOpen, LogOut, MonitorSmartphone, Wine } from "lucide-react";
import { canAccessPath, ROLE_META } from "@/lib/engine/roles";
import { activeEvent, lobbyPhase } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatTime } from "@/lib/utils";
import { KioskBadge, KioskProvider, useKiosk } from "./Kiosk";
import { isPathEnabled } from "@/lib/engine/features";
import { useEventFeatures } from "@/lib/store/hooks";

/**
 * Plataforma operativa (Puerta y Barra): interfaz limpia, alto contraste (negro/blanco + estado en color), botones
 * grandes. Exclusiva para el staff con permiso en el evento activo; Puerta y Barra no ven lobby, CRM ni finanzas.
 */
export function OpsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/ops";
  const router = useRouter();
  const { state, role, signedIn, mode } = useRouge();
  const now = useNow(30_000);
  const event = activeEvent(state);
  const features = useEventFeatures();
  const decision = canAccessPath(state, state.active_event_id, state.current_user_id, pathname, now);
  const redirect = !decision.ok ? decision.redirect : null;
  useEffect(() => {
    if (!signedIn) router.replace(`/login?as=staff&next=${encodeURIComponent(pathname)}`);
  }, [signedIn, pathname, router]);
  if (!signedIn) return null;
  if (!event || redirect) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black p-6 text-center text-white">
        <div className="max-w-sm">
          <h1 className="text-3xl">{!event ? "Sin evento activo" : "Esta pantalla no es para tu rol"}</h1>
          <p className="mt-2 text-white/70">
            {!event ? "No hay un evento para operar." : role === "attendee" ? "Tu turno no está activo ahora (los permisos de puerta y barra se habilitan 2 h antes de abrir y se apagan 1 h después del cierre)." : `Entraste como ${ROLE_META[role].emoji} ${ROLE_META[role].label}.`}
          </p>
          <Link href={redirect ?? "/login?as=staff"} className="mt-6 inline-flex min-h-[56px] items-center rounded-2xl bg-white px-6 font-display text-lg font-bold text-black">
            Ir a mi pantalla
          </Link>
        </div>
      </main>
    );
  }
  const live = lobbyPhase(event, now) === "live";
  return (
    <KioskProvider eventId={event.id}>
      <div className="min-h-dvh bg-black text-white">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-white/15 bg-black px-4 py-3">
          <span className="font-display text-xl font-bold tracking-tight text-white">ROUGE<span className="text-white/50"> · OPS</span></span>
          <span className="hidden truncate text-sm text-white/70 sm:inline">{event.name}</span>
          <span className={cn("rounded-full px-2.5 py-1 font-display text-xs font-bold", live ? "bg-squad text-black" : "bg-white/15 text-white")}>{live ? "EN VIVO" : formatTime(new Date(now).toISOString())}</span>
          <nav className="ml-auto flex items-center gap-2" aria-label="Operación">
            <OpsTab href="/ops/door" icon={<DoorOpen className="size-5" />} label="Puerta" active={pathname.startsWith("/ops/door")} show={canAccessPath(state, event.id, state.current_user_id, "/ops/door", now).ok && isPathEnabled(features, "/ops/door")} />
            <OpsTab href="/ops/bar" icon={<Wine className="size-5" />} label="Barra" active={pathname.startsWith("/ops/bar")} show={canAccessPath(state, event.id, state.current_user_id, "/ops/bar", now).ok && isPathEnabled(features, "/ops/bar")} />
            <KioskBadge />
            <KioskToggle />
            <Link href="/login?as=staff" aria-label={mode === "demo" ? "Cambiar de rol" : "Cambiar de cuenta"} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <LogOut className="size-5" />
            </Link>
          </nav>
        </header>
        {isPathEnabled(features, pathname) ? (
          children
        ) : (
          <p className="mx-auto mt-16 max-w-md rounded-3xl border-2 border-white/25 p-8 text-center text-xl text-white/80">Este módulo está desactivado para este evento.</p>
        )}
      </div>
    </KioskProvider>
  );
}

function OpsTab({ href, icon, label, active, show }: { href: string; icon: ReactNode; label: string; active: boolean; show: boolean }) {
  if (!show) return null;
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-4 font-display text-base font-bold", active ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20")}>
      {icon} {label}
    </Link>
  );
}

function KioskToggle() {
  const { role } = useRouge();
  const k = useKiosk();
  if (role !== "owner" && role !== "manager") return null;
  return (
    <button type="button" onClick={() => k.setEnabled(!k.enabled)} title="Modo Kiosco: cada integrante opera con su PIN" className={cn("inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-3 text-sm font-semibold", k.enabled ? "bg-vip text-black" : "bg-white/10 text-white hover:bg-white/20")}>
      <MonitorSmartphone className="size-5" /> <span className="hidden md:inline">{k.enabled ? "Kiosco activo" : "Modo Kiosco"}</span>
    </button>
  );
}
