"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { ChevronsLeft, ChevronsRight, Settings, ShieldCheck, Ticket, Wine } from "lucide-react";
import { activeEvent, getProfile, lobbyPhase } from "@/lib/engine/selectors";
import { isStaffRole, roleHome, staffRoleOf } from "@/lib/engine/roles";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { LiveDot } from "@/components/ui/badge";
import { isNavActive, NAV_ITEMS, useNavBadges } from "./BottomNav";
import { enabledNav } from "@/lib/engine/features";
import { useEventFeatures } from "@/lib/store/hooks";
import { PersonaSwitcher } from "./PersonaSwitcher";

const EXTRA = [
  { href: "/bar", label: "Barra Express", icon: Wine },
  { href: "/perks", label: "Perks & QRs", icon: Ticket },
] as const;

/**
 * Sidebar fijo de tablet/PC (≥ 768px). En tablet es un riel de íconos; en PC se expande
 * (estado recordado por el AppShell). Mismos indicadores en vivo que la barra inferior.
 */
export function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname() ?? "/";
  const { state, setActiveEvent, role } = useRouge();
  const now = useNow(30_000);
  const badges = useNavBadges();
  const features = useEventFeatures();
  const main = enabledNav(NAV_ITEMS, features);
  const extra = enabledNav(EXTRA, features);
  const me = getProfile(state, state.current_user_id);
  const event = activeEvent(state);
  const phase = event ? lobbyPhase(event, now) : null;
  // Eventos propios: donde entré como asistente o soy parte del equipo.
  const myEvents = useMemo(
    () => state.events.filter((e) => state.event_attendees.some((a) => a.event_id === e.id && a.user_id === state.current_user_id) || staffRoleOf(state, e.id, state.current_user_id)),
    [state],
  );
  // En tablet (md) siempre riel; la etiqueta solo se ve en PC con el sidebar expandido.
  const label = collapsed ? "sr-only" : "sr-only lg:not-sr-only lg:truncate";

  const badgeFor = (href: string): { n?: number; dot?: "sos" | "squad"; tone: string } | null => {
    if (href === "/inbox" && badges.pending) return { n: badges.pending, tone: "bg-rouge text-white" };
    if (href === "/squad" && (badges.rescue || badges.invites)) return { dot: badges.rescue ? "sos" : "squad", tone: badges.rescue ? "animate-pulse bg-sos" : "bg-squad" };
    if (href === "/perks" && badges.perks) return { n: badges.perks, tone: "bg-vip text-background" };
    if (href === "/bar" && badges.ready) return { n: badges.ready, tone: "bg-squad text-background" };
    return null;
  };

  return (
    <aside
      aria-label="Navegación principal"
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r border-white/10 bg-surface/70 backdrop-blur-xl transition-[width] duration-200 md:flex"
    >
      <div className={cn("flex items-center gap-2 px-4 pb-3 pt-5", collapsed ? "justify-center" : "justify-center lg:justify-between")}>
        <Link href="/app" className="font-display text-xl font-bold tracking-tight text-rouge" aria-label="ROUGE, inicio">
          {collapsed ? "R" : <><span className="lg:hidden">R</span><span className="hidden lg:inline">ROUGE</span></>}
        </Link>
        <button type="button" onClick={onToggle} aria-label={collapsed ? "Expandir menú" : "Colapsar menú"} title="Ctrl/⌘ + B" className={cn("hidden size-9 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-primary", !collapsed && "lg:grid")}>
          <ChevronsLeft className="size-4" />
        </button>
      </div>

      {/* Evento activo + selector */}
      {event && (
        <div className={cn("mx-3 mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2", collapsed && "hidden")}>
          <p className="hidden items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-rouge lg:flex">
            {phase === "live" && <LiveDot />} {phase === "live" ? "En vivo" : phase === "expired" ? "Terminó" : "Evento activo"}
          </p>
          {myEvents.length > 1 ? (
            <label className="hidden lg:block">
              <span className="sr-only">Cambiar de evento</span>
              <select value={event.id} onChange={(e) => setActiveEvent(e.target.value)} className="mt-1 w-full truncate rounded-xl border border-white/10 bg-background px-2 py-2 text-sm font-semibold text-primary">
                {myEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hidden truncate px-1 font-display text-sm font-semibold lg:block">{event.name}</p>
          )}
          <p className="grid place-items-center lg:hidden" title={event.name}>
            {phase === "live" ? <LiveDot /> : <span className="size-2 rounded-full bg-white/30" />}
          </p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {[...main, ...extra].map(({ href, label: text, icon: Icon }, i) => {
            const active = isNavActive(href, pathname);
            const b = badgeFor(href);
            return (
              <li key={href} className={cn(i === main.length && i > 0 && "mt-3 border-t border-white/10 pt-3")}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={text}
                  className={cn(
                    "group relative flex min-h-touch items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition",
                    collapsed ? "justify-center" : "justify-center lg:justify-start",
                    active ? "bg-rouge/15 text-primary shadow-[inset_3px_0_0_rgb(var(--c-rouge))]" : "text-muted hover:bg-white/5 hover:text-primary",
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon className={cn("size-5", active && "text-rouge drop-shadow-[0_0_8px_rgb(var(--c-rouge)/0.6)]")} />
                    {b?.dot && <span className={cn("absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-surface", b.tone)} aria-label={b.dot === "sos" ? "Alerta de rescate" : "Invitación pendiente"} />}
                    {b?.n != null && (
                      <span className={cn("absolute -right-2.5 -top-2 grid min-w-[18px] place-items-center rounded-full px-1 font-display text-[10px] font-bold leading-[18px]", b.tone, !collapsed && "lg:hidden")}>{b.n}</span>
                    )}
                  </span>
                  <span className={cn("flex-1", label)}>{text}</span>
                  {b?.n != null && !collapsed && <span className={cn("hidden min-w-[22px] rounded-full px-1.5 text-center font-display text-[11px] font-bold leading-[20px] lg:inline", b.tone)}>{b.n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {isStaffRole(role) && (
          <Link href={roleHome(role)} title="Panel del equipo" className={cn("mt-3 flex min-h-touch items-center gap-3 rounded-2xl border border-vip/30 px-3 text-sm font-semibold text-vip hover:bg-vip/10", collapsed ? "justify-center" : "justify-center lg:justify-start")}>
            <ShieldCheck className="size-5 shrink-0" />
            <span className={label}>Panel del equipo</span>
          </Link>
        )}
      </nav>

      {/* Perfil y ajustes */}
      <div className="space-y-2 border-t border-white/10 p-3">
        <PersonaSwitcher />
        {me && (
          <Link href="/profile" title="Mi perfil" className={cn("flex items-center gap-3 rounded-2xl p-1.5 hover:bg-white/5", collapsed ? "justify-center" : "justify-center lg:justify-start", isNavActive("/profile", pathname) && "bg-white/5")}>
            <Avatar profile={me} size={36} ring="rouge" />
            <span className={cn("min-w-0 flex-1", collapsed ? "hidden" : "hidden lg:block")}>
              <span className="block truncate text-sm font-semibold">{me.full_name}</span>
              <span className="block truncate text-xs text-muted">@{me.username}</span>
            </span>
          </Link>
        )}
        <div className={cn("flex gap-1", collapsed ? "flex-col items-center" : "flex-col items-center lg:flex-row")}>
          <Link href="/settings/privacy" title="Privacidad y seguridad" className="grid size-10 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-primary">
            <Settings className="size-4" />
          </Link>
          {collapsed && (
            <button type="button" onClick={onToggle} aria-label="Expandir menú" title="Ctrl/⌘ + B" className="hidden size-10 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-primary lg:grid">
              <ChevronsRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
