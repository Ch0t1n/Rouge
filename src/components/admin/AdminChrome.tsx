"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, CalendarCog, Gift, Megaphone, Martini, ShieldCheck, Tv, Users } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";

export const ADMIN_NAV = [
  { href: "/admin", label: "Resumen", icon: BarChart3 },
  { href: "/admin/events", label: "Eventos y accesos", icon: CalendarCog },
  { href: "/admin/crm", label: "CRM", icon: Users },
  { href: "/admin/blasts", label: "Text Blasts", icon: Megaphone },
  { href: "/admin/perks", label: "Perks y sorteos", icon: Gift },
  { href: "/admin/bar-pos", label: "Barra / POS", icon: Martini },
  { href: "/admin/live-wall", label: "Pantalla LED", icon: Tv },
] as const;

/** Estructura del panel: sidebar en desktop, pestañas horizontales en pantallas chicas. */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const { state, mode, setActiveEvent } = useRouge();

  // La Pantalla LED va a pantalla completa (HDMI), sin chrome.
  if (pathname.startsWith("/admin/live-wall")) return <>{children}</>;

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
        <Link href="/" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
          ROUGE
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-vip">Organizer Suite</p>
        <div className="mt-6">{eventSelect}</div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Administración">
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex min-h-touch items-center gap-3 rounded-xl px-3 text-sm font-medium transition", isActive(href) ? "bg-vip/12 text-vip" : "text-muted hover:bg-white/5 hover:text-primary")}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          {mode === "demo" && (
            <p className="flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-[11px] text-muted">
              <ShieldCheck className="size-4 shrink-0 text-squad" /> Modo Demo: acceso de staff simulado. Con Supabase, cada acción exige rol de staff del evento (RLS).
            </p>
          )}
          <Link href="/" className="block text-xs text-muted hover:text-primary">
            ← Volver a la app
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-background/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 pt-3">
            <Link href="/" className="font-display text-xl font-bold text-rouge">ROUGE</Link>
            <div className="min-w-0 flex-1">{eventSelect}</div>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2" aria-label="Administración">
            {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
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
        {children}
      </div>
    </div>
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
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("glass rounded-3xl p-5", className)}>
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
