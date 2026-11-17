"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { scrollToId } from "../core/scrollStore";
import { useEntry } from "../core/entry";
import { DEMO_HREF, useAudience } from "../core/audience";
import { cn } from "@/lib/utils";

export const NAV_LINKS = {
  public: [
    { id: "experiencia", label: "La Experiencia" },
    { id: "plano", label: "Squads & Mapa" },
    { id: "barra", label: "Barra Express" },
    { id: "ventajas", label: "Ventajas" },
    { id: "preguntas", label: "Preguntas" },
  ],
  organizers: [
    { id: "barra", label: "Barra y cobros" },
    { id: "organizadores", label: "Panel y CRM" },
    { id: "planes", label: "Planes" },
  ],
};

/** Navbar flotante glass: se compacta al bajar y las anclas usan el scroll suave de Lenis. */
export function Nav() {
  const { appHref, staffHref } = useEntry();
  const audience = useAudience();
  const links = NAV_LINKS[audience];
  const org = audience === "organizers";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    scrollToId(id);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <nav
        aria-label="Principal"
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-3 rounded-2xl border px-3 py-2 transition-all duration-500 sm:px-4",
          scrolled ? "border-white/10 bg-surface/70 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl" : "border-transparent bg-transparent",
        )}
      >
        <Link href={org ? "/organizadores" : "/"} className="flex items-center gap-2 font-display text-xl font-bold tracking-tighter" data-cursor>
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-pin-pulse rounded-full bg-rouge" />
            <span className="relative inline-flex size-2.5 rounded-full bg-rouge shadow-glow-rouge" />
          </span>
          <span>ROUGE <span className="text-rouge">PASS</span></span>
        </Link>
        <div className="ml-6 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <button key={l.id} type="button" onClick={() => go(l.id)} className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-primary">
              {l.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {org ? (
            <>
              <a href={DEMO_HREF} className="hidden min-h-[40px] items-center rounded-xl border border-vip/40 px-3 font-display text-sm font-semibold text-vip transition hover:bg-vip/10 sm:inline-flex">
                Ver la demo
              </a>
              <Link href={staffHref("/admin")} className="inline-flex min-h-[40px] items-center rounded-xl bg-rouge px-3 font-display text-sm font-semibold text-white shadow-glow-rouge transition hover:bg-rouge-hover">
                Entrar al panel
              </Link>
            </>
          ) : (
            <Link href={appHref} className="inline-flex min-h-[40px] items-center rounded-xl bg-rouge px-3 font-display text-sm font-semibold text-white shadow-glow-rouge transition hover:bg-rouge-hover">
              Entrar a un Evento
            </Link>
          )}
          <button type="button" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-10 place-items-center rounded-xl text-primary lg:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="glass mx-auto mt-2 max-w-7xl rounded-2xl p-2 lg:hidden"
          >
            {links.map((l) => (
              <button key={l.id} type="button" onClick={() => go(l.id)} className="flex min-h-touch w-full items-center rounded-xl px-3 text-left font-display font-semibold hover:bg-white/5">
                {l.label}
              </button>
            ))}
            {org && (
              <a href={DEMO_HREF} className="flex min-h-touch items-center rounded-xl px-3 font-display font-semibold text-vip hover:bg-white/5">
                Ver la demo
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
