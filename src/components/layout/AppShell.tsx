"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarX2 } from "lucide-react";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { canAccessPath, ROLE_META } from "@/lib/engine/roles";
import { isPathEnabled } from "@/lib/engine/features";
import { useEventFeatures } from "@/lib/store/hooks";
import { useRouge } from "@/lib/store/RougeContext";
import { Toaster } from "@/components/ui/toaster";
import { BottomNav, NAV_ROUTES } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { ReadyAlerts } from "@/components/monetization/ReadyAlerts";
import { LiveNotifications } from "./LiveNotifications";
import { useBrandTheme } from "@/components/brand/BrandTheme";
import { eventTheme } from "@/lib/engine/branding";
import { cn } from "@/lib/utils";

/** Rutas de usuario sin sidebar (flujos de entrada): columna centrada también en PC. */
const CHROMELESS = ["/login", "/onboarding", "/join", "/offline", "/legal", "/equipo"];
/** Rutas de usuario que aprovechan todo el ancho en PC (grillas, vistas divididas, paneles laterales). */
const WIDE = ["/app", "/lobby", "/inbox", "/chat", "/bar", "/perks", "/squad", "/map"];
// /wrapped es de lectura (columna centrada).
const SIDEBAR_KEY = "rouge:sidebar";

/**
 * Una sola interfaz, responsiva:
 * - Móvil (< 768px) → contenedor tipo teléfono (max-w-md) con la barra inferior.
 * - Tablet/PC (≥ 768px) → layout fluido con sidebar izquierdo fijo (riel en tablet, expandible en PC)
 *   y contenido hasta max-w-7xl (las pantallas de lectura, como perfil o ajustes, quedan en max-w-3xl).
 * - Rutas /admin/* → vista expandida (el organizador opera desde una laptop).
 * - "/" → landing pública a ancho completo (sin sesión ni evento).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // "/" (público) y "/organizadores" (oculto, para dueños y productoras): misma landing a ancho completo.
  // "/pro": ROUGE PRO, la vertical corporativa (pública, a ancho completo, sin evento ni sesión).
  const landing = pathname === "/" || pathname === "/organizadores" || pathname === "/pro";
  // /demo: página para anfitriones (guion + modo presentador), a ancho completo y pública.
  const demoPage = pathname === "/demo" || pathname.startsWith("/demo/");
  const expanded = landing || demoPage || pathname.startsWith("/admin") || pathname === "/ops" || pathname.startsWith("/ops/") || pathname.startsWith("/superadmin");
  const withNav = NAV_ROUTES.includes(pathname);
  const opsPage = pathname === "/ops" || pathname.startsWith("/ops/") || pathname.startsWith("/superadmin");
  const chromeless = CHROMELESS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const wide = WIDE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const { state, mode, signedIn, notify } = useRouge();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "collapsed");
    } catch {
      /* sin storage: expandido */
    }
  }, []);
  const toggleSidebar = useCallback(
    () =>
      setCollapsed((c) => {
        try {
          localStorage.setItem(SIDEBAR_KEY, c ? "expanded" : "collapsed");
        } catch {
          /* noop */
        }
        return !c;
      }),
    [],
  );
  const router = useRouter();
  // Supabase: sin sesión solo se ven las rutas públicas; el resto pasa primero por el login.
  const isPublic = landing || demoPage || ["/login", "/join", "/offline", "/legal"].some((p) => pathname.startsWith(p));
  const needsLogin = mode === "supabase" && !signedIn && !isPublic;
  useEffect(() => {
    if (needsLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [needsLogin, pathname, router]);
  // Rutas que no dependen de un evento activo (perfil, ingreso, chats 1:1, alta de eventos…)
  const eventFree = landing || demoPage || ["/login", "/onboarding", "/join", "/profile", "/settings", "/u/", "/chat", "/inbox", "/offline", "/legal", "/equipo", "/admin/events", "/ops", "/superadmin"].some((p) => pathname.startsWith(p));
  const missingEvent = !eventFree && !activeEvent(state);
  // Colores de la marca del evento en la app del asistente y en la Pantalla LED. La landing, la demo, el login,
  // /join (aplica el tema del evento del link) y el panel del staff quedan con los colores de ROUGE.
  const branded = !landing && !demoPage && !["/login", "/join"].some((p) => pathname.startsWith(p)) && (!pathname.startsWith("/admin") || pathname.startsWith("/admin/live-wall"));
  const theme = eventTheme(state, state.active_event_id);
  useBrandTheme(branded && theme.custom ? theme : null);
  const sidebar = !expanded && !chromeless && !needsLogin && !opsPage;
  // Aislamiento de plataformas (app del asistente y consola global; /admin y /ops tienen su propio chrome).
  const access = canAccessPath(state, state.active_event_id, state.current_user_id, pathname);
  // Módulos del evento (v1.8): una ruta de un módulo apagado vuelve a /app con un aviso sutil.
  const features = useEventFeatures();
  const moduleOff = !expanded && !chromeless && !!activeEvent(state) && !isPathEnabled(features, pathname);
  useEffect(() => {
    if (!moduleOff) return;
    notify({ tone: "info", title: "Esa sección no está activa en este evento", duration: 2600 });
    router.replace("/app");
  }, [moduleOff, notify, router]);
  const blocked = !access.ok && access.surface !== "owner_admin" && access.surface !== "staff_ops" && !!getProfile(state, state.current_user_id) ? access : null;
  // El ancho del sidebar vive en una variable CSS de <html> para que los elementos fixed (portales incluidos) lo respeten.
  useEffect(() => {
    const root = document.documentElement;
    if (sidebar) root.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    else delete root.dataset.sidebar;
    return () => {
      delete root.dataset.sidebar;
    };
  }, [sidebar, collapsed]);
  // Atajo de teclado (PC): Ctrl/⌘ + B colapsa o expande el sidebar.
  useEffect(() => {
    if (!sidebar) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebar, toggleSidebar]);

  return (
    <>
      {/* Ambiente de fondo para desktop (fuera del "teléfono") */}
      {!expanded && (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden md:block">
          <div className={cn("absolute left-[8%] top-[8%] size-[440px] rounded-full blur-[140px]", sidebar ? "bg-rouge/10" : "bg-rouge/20")} />
          <div className={cn("absolute bottom-[4%] right-[8%] size-[440px] rounded-full blur-[140px]", sidebar ? "bg-squad/5" : "bg-squad/15")} />
        </div>
      )}
      <div
        className={cn(
          "relative min-h-screen bg-background",
          expanded
            ? "w-full"
            : sidebar
              ? "mx-auto max-w-md border-x border-white/10 shadow-2xl md:max-w-none md:border-x-0 md:bg-transparent md:pl-[var(--sidebar-w)] md:shadow-none md:transition-[padding] md:duration-200"
              : "mx-auto max-w-md border-x border-white/10 shadow-2xl md:max-w-xl md:border-x-0 md:bg-transparent md:shadow-none",
          withNav && "pb-[calc(64px+var(--safe-bottom))] md:pb-0",
        )}
      >
        {sidebar ? (
          <div className={cn("mx-auto w-full", wide ? "md:max-w-7xl md:px-4 lg:px-6" : "md:max-w-3xl md:px-4")}>{needsLogin || moduleOff ? null : blocked ? <WrongSurface redirect={blocked.redirect} /> : missingEvent ? <NoEvent admin={false} /> : children}</div>
        ) : needsLogin ? null : blocked ? (
          <WrongSurface redirect={blocked.redirect} />
        ) : missingEvent ? (
          <NoEvent admin={expanded} />
        ) : (
          children
        )}
      </div>
      {sidebar && <DesktopSidebar collapsed={collapsed} onToggle={toggleSidebar} />}
      {withNav && !missingEvent && !needsLogin && <BottomNav />}
      {!expanded && <LiveNotifications />}
      {!expanded && <ReadyAlerts />}
      <Toaster />
    </>
  );
}

/** La ruta es de otra plataforma (ej. Puerta/Barra en turno intentando abrir el lobby). */
function WrongSurface({ redirect }: { redirect: string }) {
  const { role } = useRouge();
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(redirect), 2500);
    return () => clearTimeout(t);
  }, [redirect, router]);
  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-2xl">Esta pantalla no es para tu rol</h1>
      <p className="max-w-sm text-sm text-muted">
        Estás de turno como {ROLE_META[role].emoji} {ROLE_META[role].label}: tu pantalla es la de operación. El lobby, el CRM y las finanzas no están disponibles durante tu turno.
      </p>
      <Link href={redirect} className="mt-2 inline-flex min-h-touch items-center rounded-2xl bg-rouge px-5 font-display font-semibold text-white shadow-glow-rouge">
        Ir a mi pantalla
      </Link>
    </main>
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
