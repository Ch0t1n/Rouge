"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Inbox, LayoutGrid, Map as MapIcon, UsersRound } from "lucide-react";
import { inboxOf, ordersOf, pendingSquadInvites, perksOf, rescueAlertsFor } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/app", label: "Inicio", icon: House },
  { href: "/lobby", label: "Lobby", icon: LayoutGrid },
  { href: "/map", label: "Plano", icon: MapIcon },
  { href: "/squad", label: "Squad", icon: UsersRound },
  { href: "/inbox", label: "Bandeja", icon: Inbox },
] as const;

/** Rutas donde se muestra la navegación inferior (móvil). En tablet/PC manda el sidebar. */
export const NAV_ROUTES: readonly string[] = [...NAV_ITEMS.map((i) => i.href), "/profile", "/perks"];

export const isNavActive = (href: string, pathname: string) => (href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/") || (href === "/inbox" && pathname.startsWith("/chat/")));

/** Indicadores en vivo compartidos por la barra inferior y el sidebar (misma fuente: el estado). */
export function useNavBadges() {
  const { state } = useRouge();
  const me = state.current_user_id;
  const ev = state.active_event_id;
  return {
    pending: inboxOf(state, me, ev).length,
    rescue: rescueAlertsFor(state, ev, me).length,
    invites: pendingSquadInvites(state, ev, me).length,
    perks: perksOf(state, me, ev).filter((p) => p.status === "available").length,
    ready: ordersOf(state, me, ev).filter((o) => o.status === "ready_qr" || o.status === "delivering").length,
  };
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { pending, rescue, invites } = useNavBadges();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/10 bg-background/85 pb-[var(--safe-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isNavActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition", active ? "text-rouge" : "text-muted hover:text-primary")}
              >
                <span className="relative">
                  <Icon className={cn("size-[22px]", active && "drop-shadow-[0_0_8px_rgb(var(--c-rouge)/0.6)]")} />
                  {href === "/squad" && (rescue > 0 || invites > 0) && (
                    <span className={cn("absolute -right-1.5 -top-1 size-3 rounded-full ring-2 ring-background", rescue ? "animate-pulse bg-sos shadow-glow-sos" : "bg-squad")} aria-label={rescue ? "Alerta de rescate" : "Invitación pendiente"} />
                  )}
                  {href === "/inbox" && pending > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-rouge px-1 font-display text-[10px] font-bold leading-[18px] text-white shadow-glow-rouge">
                      {pending}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
