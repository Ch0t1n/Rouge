"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, CalendarCog, Gift, Lock, LogOut, Megaphone, Martini, Palette, ScanLine, Share2, ShieldCheck, UtensilsCrossed, Tv, Users } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { NO_PERMISSION, permissionForPath, ROLE_META, roleHome } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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
  const { state, mode, setActiveEvent, signedIn, role, can } = useRouge();
  const perm = permissionForPath(pathname);
  // Crear un evento nuevo está abierto a cualquiera con sesión (queda como dueño/a); el resto exige su permiso.
  const allowed = signedIn && (!perm || can(perm) || pathname === "/admin/events");
  const nav = ADMIN_NAV.filter((n) => can(permissionForPath(n.href)!));
  const me = getProfile(state, state.current_user_id);
  const meta = ROLE_META[role];

  if (!allowed) return <NoAccess />;
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-surface/60 p-5 lg:flex">
        <Link href="/app" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
          ROUGE
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-vip">Organizer Suite</p>
        <div className="mt-6">{eventSelect}</div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Administración">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex min-h-touch items-center gap-3 rounded-xl px-3 text-sm font-medium transition", isActive(href) ? "bg-vip/15 text-vip" : "text-muted hover:bg-white/5 hover:text-primary")}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="truncate text-sm font-semibold">{me?.full_name ?? "Sin perfil"}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-vip">
              <span aria-hidden>{meta.emoji}</span> {meta.label}
            </p>
            <Link href="/login?as=staff" className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-primary">
              <LogOut className="size-3.5" /> {mode === "demo" ? "Cambiar de rol" : "Cambiar de cuenta"}
            </Link>
          </div>
          {mode === "demo" && (
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
            <Link href="/app" className="font-display text-xl font-bold text-rouge">ROUGE</Link>
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
                className={cn("flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", isActive(href) ? "bg-vip text-background" : "bg-white/[0.05] text-muted")}
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
        {children}
      </div>
    </div>
  );
}

/** Pantalla para quien no tiene sesión o cuyo rol no incluye esta sección. */
function NoAccess() {
  const pathname = usePathname() ?? "/admin";
  const { signedIn, role, mode } = useRouge();
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
                {mode === "demo" ? "Entrar con otro rol" : "Ingresar con otra cuenta"}
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
    <div className="flex flex-wrap items-end justify-between gap-4">
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
