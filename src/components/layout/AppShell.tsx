"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CalendarX2 } from "lucide-react";
import { activeEvent } from "@/lib/engine/selectors";
import { BootScreen, useOptionalRouge } from "@/lib/store/RougeContext";
import { Toaster } from "@/components/ui/toaster";
import { BottomNav, NAV_ROUTES } from "./BottomNav";
import { LiveNotifications } from "./LiveNotifications";
import { useBrandTheme } from "@/components/brand/BrandTheme";
import { eventTheme } from "@/lib/engine/branding";
import { cn } from "@/lib/utils";

/**
 * Una sola interfaz para móvil y desktop:
 * - Rutas de usuario → contenedor móvil centrado (max-w-md) también en desktop.
 * - Rutas /admin/* → vista expandida (el organizador opera desde una laptop).
 * - "/" → landing pública a ancho completo (sin sesión ni evento).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // "/" (público) y "/organizadores" (oculto, para dueños y productoras): misma landing a ancho completo.
  const landing = pathname === "/" || pathname === "/organizadores";
  // /demo: página para anfitriones (guion + modo presentador), a ancho completo y pública.
  const demoPage = pathname === "/demo" || pathname.startsWith("/demo/");
  const expanded = landing || demoPage || pathname.startsWith("/admin");
  const withNav = NAV_ROUTES.includes(pathname);
  // Sin estado todavía (servidor y primer render): la landing se renderiza igual —así su texto llega en el HTML
  // que leen los buscadores— y el resto de la app espera en el BootScreen.
  const ctx = useOptionalRouge();
  const state = ctx?.state ?? null;
  const mode = ctx?.mode;
  const signedIn = ctx?.signedIn ?? false;
  const router = useRouter();
  // Supabase: sin sesión solo se ven las rutas públicas; el resto pasa primero por el login.
  const isPublic = landing || demoPage || ["/login", "/join", "/offline"].some((p) => pathname.startsWith(p));
  const needsLogin = mode === "supabase" && !signedIn && !isPublic;
  useEffect(() => {
    if (needsLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [needsLogin, pathname, router]);
  // Rutas que no dependen de un evento activo (perfil, ingreso, chats 1:1, alta de eventos…)
  const eventFree = landing || demoPage || ["/login", "/onboarding", "/join", "/profile", "/settings", "/u/", "/chat", "/inbox", "/offline", "/admin/events"].some((p) => pathname.startsWith(p));
  const missingEvent = !!state && !eventFree && !activeEvent(state);
  // Colores de la marca del evento en la app del asistente y en la Pantalla LED. La landing, la demo, el login,
  // /join (aplica el tema del evento del link) y el panel del staff quedan con los colores de ROUGE.
  const branded = !landing && !demoPage && !["/login", "/join"].some((p) => pathname.startsWith(p)) && (!pathname.startsWith("/admin") || pathname.startsWith("/admin/live-wall"));
  const theme = state ? eventTheme(state, state.active_event_id) : null;
  useBrandTheme(branded && theme?.custom ? theme : null);

  if (!ctx && !landing) return <BootScreen />;

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
        {needsLogin ? null : missingEvent ? <NoEvent admin={expanded} /> : children}
      </div>
      {ctx && withNav && !missingEvent && !needsLogin && <BottomNav />}
      {ctx && !expanded && <LiveNotifications />}
      {ctx && <Toaster />}
    </>
  );
}

/** Supabase recién creado o usuario sin eventos: invita a entrar con un código (o a crear uno). */
function NoEvent({ admin }: { admin: boolean }) {
  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-rouge/15 text-rouge">
        <CalendarX2 className="size-7" />
      </span>
      <h1 className="text-2xl">{admin ? "Todavía no hay eventos" : "No hay ninguna fiesta activa"}</h1>
      <p className="max-w-sm text-sm text-muted">{admin ? "Creá tu primer evento para generar el link maestro y los códigos de entrada." : "Ingresá el código o el link de tu entrada para entrar al lobby."}</p>
      <Link href={admin ? "/admin/events" : "/join"} className="mt-2 inline-flex min-h-touch items-center rounded-2xl bg-rouge px-5 font-display font-semibold text-white shadow-glow-rouge">
        {admin ? "Crear evento" : "Tengo un código"}
      </Link>
    </main>
  );
}
