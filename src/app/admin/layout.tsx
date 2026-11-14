import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, CalendarCog, Gift, Megaphone, Martini, Tv, Users } from "lucide-react";

export const metadata = { title: "Panel del Organizador" };

const NAV = [
  { href: "/admin", label: "Resumen", icon: BarChart3, ready: true },
  { href: "/admin/events", label: "Eventos y accesos", icon: CalendarCog },
  { href: "/admin/crm", label: "CRM", icon: Users },
  { href: "/admin/blasts", label: "Text Blasts", icon: Megaphone },
  { href: "/admin/perks", label: "Perks y sorteos", icon: Gift },
  { href: "/admin/bar-pos", label: "Barra / POS", icon: Martini },
  { href: "/admin/live-wall", label: "Pantalla LED", icon: Tv },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-surface/60 p-5 lg:flex">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight text-rouge text-glow-rouge">
          ROUGE
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-vip">Organizer Suite</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Administración">
          {NAV.map(({ href, label, icon: Icon, ready }) => (
            <Link
              key={href}
              href={ready ? href : "/admin"}
              aria-disabled={!ready}
              className={
                "flex min-h-touch items-center gap-3 rounded-xl px-3 text-sm font-medium transition " +
                (ready ? "bg-white/5 text-primary" : "text-muted/60 hover:text-muted")
              }
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              {!ready && <span className="text-[10px] font-semibold uppercase text-muted/50">Fase 5</span>}
            </Link>
          ))}
        </nav>
        <Link href="/" className="mt-auto text-xs text-muted hover:text-primary">
          ← Volver a la app
        </Link>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
