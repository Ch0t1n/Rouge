"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { BottomNav, NAV_ROUTES } from "./BottomNav";
import { LiveNotifications } from "./LiveNotifications";
import { cn } from "@/lib/utils";

/**
 * Una sola interfaz para móvil y desktop:
 * - Rutas de usuario → contenedor móvil centrado (max-w-md) también en desktop.
 * - Rutas /admin/* → vista expandida (el organizador opera desde una laptop).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const expanded = pathname.startsWith("/admin");
  const withNav = NAV_ROUTES.includes(pathname);

  return (
    <>
      {/* Ambiente de fondo para desktop (fuera del "teléfono") */}
      {!expanded && (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden md:block">
          <div className="absolute left-[8%] top-[8%] size-[440px] rounded-full bg-rouge/20 blur-[140px]" />
          <div className="absolute bottom-[4%] right-[8%] size-[440px] rounded-full bg-squad/15 blur-[140px]" />
        </div>
      )}
      <div
        className={cn(
          "relative min-h-screen bg-background",
          expanded ? "w-full" : "mx-auto max-w-md border-x border-white/10 shadow-2xl",
          withNav && "pb-[calc(64px+var(--safe-bottom))]",
        )}
      >
        {children}
      </div>
      {withNav && <BottomNav />}
      {!expanded && <LiveNotifications />}
      <Toaster />
    </>
  );
}
