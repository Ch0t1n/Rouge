"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRO_NAV } from "./content";
import { ModeSwitch } from "./ModeSwitch";
import { useDemoRequest } from "./ProDemoForm";

export function ProLogo({ className }: { className?: string }) {
  return (
    <Link href="/pro" className={cn("flex items-center gap-2 font-pro text-lg font-bold tracking-[-0.03em] text-white", className)} aria-label="ROUGE PRO, inicio">
      ROUGE
      <span className="rounded-md border border-pro-gold/50 bg-gradient-to-r from-pro-cobalt to-pro-sapphire px-1.5 py-0.5 font-pro-mono text-[10px] font-semibold tracking-[0.18em] text-white">PRO</span>
    </Link>
  );
}

/** Navbar ejecutivo: anclas, switch Nightlife ⇄ PRO, "Solicitar Demo" (modal) y acceso a organizadores. */
export function ProNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const demo = useDemoRequest();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={cn("sticky top-0 z-50 border-b transition-colors duration-300", scrolled ? "border-pro-line bg-pro-navy/85 backdrop-blur-xl" : "border-transparent bg-pro-navy")}>
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <ProLogo />
        <nav aria-label="Secciones" className="ml-4 hidden items-center xl:flex">
          {PRO_NAV.map((l) => (
            <a key={l.id} href={`#${l.id}`} className="whitespace-nowrap rounded-lg px-2.5 py-2 font-pro text-[13px] text-pro-mist transition hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ModeSwitch active="pro" variant="pro" className="hidden md:inline-flex" />
          <Link href="/admin" className="hidden min-h-[40px] items-center whitespace-nowrap rounded-xl px-3 font-pro text-sm font-semibold text-pro-mist transition hover:text-white lg:inline-flex xl:hidden 2xl:inline-flex">
            Acceso Organizadores
          </Link>
          <button type="button" onClick={() => demo.open("pro · navbar")} className="hidden min-h-[40px] items-center whitespace-nowrap rounded-xl bg-pro-cobalt px-4 font-pro text-sm font-semibold text-white transition hover:bg-pro-sapphire sm:inline-flex">
            Solicitar Demo
          </button>
          <button type="button" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-11 place-items-center rounded-xl text-white xl:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-pro-line bg-pro-navy px-4 pb-4 xl:hidden">
          <nav aria-label="Secciones" className="py-2">
            {PRO_NAV.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)} className="flex min-h-[44px] items-center font-pro text-sm font-semibold text-white">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-3 border-t border-pro-line pt-3">
            <ModeSwitch active="pro" variant="pro" />
            <Link href="/admin" className="font-pro text-sm font-semibold text-pro-mist">
              Acceso Organizadores
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                demo.open("pro · menú");
              }}
              className="ml-auto inline-flex min-h-[44px] items-center rounded-xl bg-pro-cobalt px-4 font-pro text-sm font-semibold text-white"
            >
              Solicitar Demo
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
