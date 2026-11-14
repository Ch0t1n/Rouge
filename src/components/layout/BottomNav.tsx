"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Inbox, LayoutGrid, UserRound } from "lucide-react";
import { inboxOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/lobby", label: "Lobby", icon: LayoutGrid },
  { href: "/inbox", label: "Bandeja", icon: Inbox },
  { href: "/profile", label: "Perfil", icon: UserRound },
] as const;

/** Rutas donde se muestra la navegación inferior. */
export const NAV_ROUTES = ITEMS.map((i) => i.href) as readonly string[];

export function BottomNav() {
  const pathname = usePathname();
  const { state } = useRouge();
  const pending = inboxOf(state, state.current_user_id, state.active_event_id).length;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-white/10 bg-background/85 pb-[var(--safe-bottom)] backdrop-blur-xl"
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition", active ? "text-rouge" : "text-muted hover:text-primary")}
              >
                <span className="relative">
                  <Icon className={cn("size-[22px]", active && "drop-shadow-[0_0_8px_rgba(255,30,86,0.6)]")} />
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
