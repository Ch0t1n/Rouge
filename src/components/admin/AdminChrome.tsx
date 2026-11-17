"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, CalendarCog, Gift, Lock, LogOut, Megaphone, Martini, Palette, ScanLine, Share2, ShieldCheck, UtensilsCrossed, Tv, Users } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { canAccessPath, NO_PERMISSION, permissionForPath, ROLE_META, roleHome } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { isPathEnabled } from "@/lib/engine/features";
import { useEventFeatures } from "@/lib/store/hooks";
import { Wordmark } from "@/components/brand/Wordmark";

export const ADMIN_NAV = [
  { href: "/admin", label: "Resumen", icon: BarChart3 },
  { href: "/admin/events", label: "Eventos y accesos", icon: CalendarCog },
  { href: "/admin/brand", label: "Marca y cobros", icon: Palette },
  { href: "/admin/menu", label: "Menú de la barra", icon: UtensilsCrossed },
  { href: "/admin/crm", label: "CRM", icon: Users },
  { href: "/admin/blasts", label: "Text Blasts", icon: Megaphone },
  { href: "/admin/perks", label: "Perks y sorteos", icon: Gift },
  { href: "/admin/bar-pos", label: "Barra / POS", icon: Martini },
  { href: "/admin/door", label: "Puerta", icon: ScanLine },
  { href: "/admin/rrpp", label: "RRPP", icon: Share2 },
  { href: "/admin/live-wall", label: "Pantalla LED", icon: Tv },
] as const;

/** Estructura del panel: sidebar en desktop, pestañas horizontales en pantallas chicas. */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const { state, demoVisible, setActiveEvent, signedIn, role, can } = useRouge();
  const perm = permissionForPath(pathname);
  // Aislamiento de plataformas: puerta y barra van a /ops; el asistente solo puede crear SU evento; el resto según
  // su permiso (misma regla que canAccessPath y que has_staff_role en el servidor).
  const access = (href: string) => canAccessPath(state, state.active_event_id, state.current_user_id, href);
  const allowed = signedIn && access(pathname).ok;
  const nav = ADMIN_NAV.filter((n) => can(permissionForPath(n.href)!) && access(n.href).ok);
  // Módulos del evento activo (v1.8): las secciones de un módulo apagado se ven atenuadas y no se abren.
  const features = useEventFeatures();
  const moduleOn = (href: string) => isPathEnabled(features, href);
  const me = getProfile(state, state.current_user_id);
  const meta = ROLE_META[role];

  const shortcuts = useAdminShortcuts(nav.map((n) => n.href));

  if (!allowed) return <NoAccess />;
  if (!moduleOn(pathname)) return <ModuleOff />;
  // La Pantalla LED va a pantalla completa (HDMI), sin chrome.
  if (pathname.startsWith("/admin/live-wall") || pathname.startsWith("/admin/print-codes") || pathname.startsWith("/admin/print-ticket")) return <>{children}</>;

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const eventSelect = (
    <label className="block">
      <span className="sr-only">Evento</span>
      <select
        value={state.active_event_id}
        onChange={(e) => setActiveEvent(e.target.value)}
        className="min-h-touch w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-vip/50"
      >
        {state.events.map((e) => (
          <option key={e.id} value={e.id} className="bg-surface">
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex min-h-screen">
      {shortcuts.sheet}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-surface/60 p-5 lg:flex 2xl:w-72">
        <Link href="/app" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
          <Wordmark />
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-vip">Organizer Suite</p>
        <div className="mt-6">{eventSelect}</div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Administración">
          {nav.map(({ href, label, icon: Icon }, i) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              aria-keyshortcuts={i < 9 ? `Alt+${i + 1}` : undefined}
              title={moduleOn(href) ? undefined : "Módulo desactivado para este evento"}
              className={cn("group flex min-h-touch items-center gap-3 rounded-xl px-3 text-sm font-medium transition", isActive(href) ? "bg-vip/15 text-vip" : "text-muted hover:bg-white/5 hover:text-primary", !moduleOn(href) && "opacity-40")}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              {!moduleOn(href) && <span className="rounded-md bg-white/10 px-1.5 font-display text-[10px] font-bold uppercase">Off</span>}
              {i < 9 && <kbd className="hidden rounded-md border border-white/10 px-1.5 font-display text-[10px] text-muted/70 group-hover:inline xl:inline">⌥{i + 1}</kbd>}
            </Link>
          ))}
          <button type="button" onClick={shortcuts.open} className="mt-2 flex min-h-[36px] items-center gap-2 rounded-xl px-3 text-left text-xs text-muted hover:text-primary">
            <kbd className="rounded-md border border-white/10 px-1.5 font-display text-[10px]">?</kbd> Atajos de teclado
          </button>
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="truncate text-sm font-semibold">{me?.full_name ?? "Sin perfil"}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-vip">
              <span aria-hidden>{meta.emoji}</span> {meta.label}
            </p>
            <Link href="/login?as=staff" className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-primary">
              <LogOut className="size-3.5" /> {demoVisible ? "Cambiar de rol" : "Cambiar de cuenta"}
            </Link>
          </div>
          {demoVisible && (
            <p className="flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-[11px] text-muted">
              <ShieldCheck className="size-4 shrink-0 text-squad" /> Modo Demo: cada rol ve solo sus secciones (igual que con Supabase, donde lo exige el servidor).
            </p>
          )}
          <Link href="/app" className="block text-xs text-muted hover:text-primary">
            ← Volver a la app
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-background/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 pt-3">
            <Link href="/app" className="font-display text-xl font-bold text-rouge"><Wordmark /></Link>
            <div className="min-w-0 flex-1">{eventSelect}</div>
            <Link href="/login?as=staff" aria-label={`${meta.label}: cambiar de rol`} className="flex min-h-touch shrink-0 items-center gap-1 rounded-full bg-vip/15 px-3 font-display text-xs font-semibold text-vip">
              <span aria-hidden>{meta.emoji}</span> {meta.label}
            </Link>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2" aria-label="Administración">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn("flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", isActive(href) ? "bg-vip text-background" : "bg-white/[0.05] text-muted", !moduleOn(href) && "opacity-40 line-through")}
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </nav>
        </div>
        {!can(perm ?? "admin.events") && (
          <div className="mx-5 mt-5 rounded-2xl border border-vip/40 bg-vip/10 p-4 text-sm lg:mx-10">
            Todavía no sos parte del equipo de este evento. Creá el tuyo acá abajo (quedás como dueño/a) o pedile al dueño/a que te sume.
          </div>
        )}
        <div key={pathname} className="animate-in fade-in duration-200 motion-reduce:animate-none">{children}</div>
      </div>
    </div>
  );
}

/**
 * Atajos del panel (PC): Alt+1…9 abre cada sección del menú, "/" enfoca el buscador de la página
 * (inputs con data-admin-search) y "?" muestra la ayuda. Se ignoran mientras se escribe en un campo.
 */
function useAdminShortcuts(hrefs: string[]) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const routes = hrefs.join("|");
  useEffect(() => {
    const list = routes.split("|");
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const href = list[Number(e.code.slice(5)) - 1];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>("[data-admin-search]");
        if (input) {
          e.preventDefault();
          input.focus();
        }
      } else if (e.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [routes, router]);
  const sheet = (
    <BottomSheet open={help} onClose={() => setHelp(false)} title="Atajos de teclado" description="Para operar la noche desde la notebook sin soltar el teclado.">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {[
          ["Alt + 1…9", "Ir a cada sección del menú (en orden)"],
          ["/", "Buscar en la página (CRM, comandas…)"],
          ["Esc", "Cerrar paneles y diálogos"],
          ["?", "Mostrar esta ayuda"],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-0.5 font-display text-xs">{k}</kbd>
            </dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </BottomSheet>
  );
  return { sheet, open: () => setHelp(true) };
}

/** Sección de un módulo apagado en el evento activo (lo configura ROUGE o el dueño/a con autogestión). */
function ModuleOff() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-5">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10 text-muted">
          <Lock className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl">Módulo desactivado para este evento</h1>
        <p className="mt-2 text-sm text-muted">Esta sección no forma parte de la configuración del evento activo. Elegí otro evento o pedí que activen el módulo.</p>
        <Link href="/admin" className={cn(buttonVariants({ variant: "vip", block: true }), "mt-6")}>
          Volver al resumen
        </Link>
      </div>
    </main>
  );
}

/** Pantalla para quien no tiene sesión o cuyo rol no incluye esta sección. */
function NoAccess() {
  const pathname = usePathname() ?? "/admin";
  const { signedIn, role, demoVisible } = useRouge();
  const meta = ROLE_META[role];
  const home = roleHome(role);
  const next = encodeURIComponent(pathname);
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-vip/15 text-vip">
          <Lock className="size-6" />
        </span>
        {!signedIn ? (
          <>
            <h1 className="mt-5 text-2xl">Panel del equipo</h1>
            <p className="mt-2 text-sm text-muted">Ingresá con tu cuenta del equipo del evento para operar el panel.</p>
            <Link href={`/login?as=staff&next=${next}`} className={cn(buttonVariants({ variant: "vip", block: true }), "mt-6")}>
              Ingresar
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl">Esta sección no es para tu rol</h1>
            <p className="mt-2 text-sm text-muted">
              Entraste como <span className="font-semibold text-primary">{meta.emoji} {meta.label}</span>. {NO_PERMISSION}
            </p>
            <div className="mt-6 grid gap-2">
              <Link href={home} className={buttonVariants({ variant: "vip", block: true })}>
                Ir a mi pantalla
              </Link>
              <Link href={`/login?as=staff&next=${next}`} className={buttonVariants({ variant: "glass", block: true })}>
                {demoVisible ? "Entrar con otro rol" : "Ingresar con otra cuenta"}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/** Encabezado estándar de cada sección del admin. */
export function AdminHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    // Cabecera fija en PC: el título y las acciones de la sección quedan a la vista al scrollear tablas largas.
    <div className="flex flex-wrap items-end justify-between gap-4 lg:sticky lg:top-0 lg:z-20 lg:-mx-2 lg:bg-background/85 lg:px-2 lg:py-3 lg:backdrop-blur-xl">
      <div>
        <h1 className="text-3xl lg:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    // min-w-0: como ítem de grilla, un panel nunca se estira por el ancho de su contenido (filas con scroll, links largos).
    <section className={cn("glass min-w-0 rounded-3xl p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Descarga un CSV generado en el navegador (UTF-8 con BOM para Excel). */
export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
