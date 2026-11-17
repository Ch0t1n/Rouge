"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, Tv } from "lucide-react";
import { FRAME_PERSONA_PREFIX, useRouge } from "@/lib/store/RougeContext";
import { DEMO_ROLES, DEMO_SCRIPT, type DemoRole } from "@/lib/demo/script";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/Wordmark";

const PHONE = { w: 390, h: 844 };
const PANEL_ROLES: DemoRole[] = ["duena", "produccion", "barra", "mozo", "seguridad", "rrpp"];

/**
 * Modo presentador: el teléfono del asistente y el panel del equipo lado a lado, sincronizados en vivo
 * (mismo navegador). Cada lado es un iframe con su propia persona (window.name, ver RougeContext).
 */
export function Presenter() {
  const { mode, resetDemo, notify } = useRouge();
  const [step, setStep] = useState(0);
  const [phoneRole, setPhoneRole] = useState<DemoRole>("asistente");
  const [phonePath, setPhonePath] = useState(DEMO_SCRIPT[0].phone);
  const [panelRole, setPanelRole] = useState<DemoRole>(DEMO_SCRIPT[0].panelRole);
  const [panelPath, setPanelPath] = useState(DEMO_SCRIPT[0].panel);
  const [nonce, setNonce] = useState(0);
  // Reiniciar en orden: 1) se desmontan los marcos (al cerrarse guardan su estado), 2) se resiembra, 3) se vuelven a abrir.
  // Si se resembrara con los marcos abiertos, su guardado al cerrarse pisaría la fiesta nueva.
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    if (!resetting) return;
    resetDemo();
    setNonce((n) => n + 1);
    setResetting(false);
    notify({ tone: "squad", title: "Demo reiniciada" });
  }, [resetting, resetDemo, notify]);
  const phoneBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);

  // El teléfono se escala para entrar entero en el alto disponible.
  useEffect(() => {
    const el = phoneBox.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, (el.clientHeight - 8) / (PHONE.h + 20), (el.clientWidth - 8) / (PHONE.w + 20)));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  const go = (i: number) => {
    const s = DEMO_SCRIPT[i];
    setStep(i);
    setPhonePath(s.phone);
    setPanelRole(s.panelRole);
    setPanelPath(s.panel);
  };

  if (mode !== "demo")
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-muted">
          El modo presentador funciona en el sitio de demostración. <Link href="/demo" className="text-vip underline">Volver</Link>
        </p>
      </main>
    );

  const s = DEMO_SCRIPT[step];
  const phone = DEMO_ROLES[phoneRole];
  const panel = DEMO_ROLES[panelRole];

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Barra del presentador */}
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-surface/80 px-3 py-2 backdrop-blur-xl">
        <Link href="/demo" className={buttonVariants({ size: "sm", variant: "ghost" })} aria-label="Volver a la página de la demo">
          <ArrowLeft />
        </Link>
        <span className="font-display text-lg font-bold text-rouge"><Wordmark /></span>
        <div className="mx-2 flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Paso anterior" disabled={step === 0} onClick={() => go(step - 1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-0 font-display text-sm font-semibold">
            {step + 1}/{DEMO_SCRIPT.length} · {s.title} <span className="font-sans text-xs font-normal text-muted">{s.minutes}</span>
          </span>
          <Button size="icon" variant="ghost" aria-label="Paso siguiente" disabled={step === DEMO_SCRIPT.length - 1} onClick={() => go(step + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {PANEL_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setPanelRole(r);
                setPanelPath(DEMO_ROLES[r].home);
              }}
              aria-pressed={panelRole === r && panelPath !== "/admin/live-wall"}
              className={cn(
                "min-h-[36px] rounded-full px-3 font-display text-xs font-semibold transition",
                panelRole === r && panelPath !== "/admin/live-wall" ? "bg-vip text-background" : "bg-white/[0.06] text-muted hover:text-primary",
              )}
            >
              {DEMO_ROLES[r].emoji} {DEMO_ROLES[r].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPanelRole("duena");
              setPanelPath("/admin/live-wall");
            }}
            aria-pressed={panelPath === "/admin/live-wall"}
            className={cn("inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 font-display text-xs font-semibold", panelPath === "/admin/live-wall" ? "bg-rouge text-white" : "bg-white/[0.06] text-muted hover:text-primary")}
          >
            <Tv className="size-3.5" /> LED
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              go(0);
              setResetting(true);
            }}
          >
            <RotateCcw /> Reiniciar
          </Button>
        </div>
      </header>

      {/* Qué decir / qué tocar */}
      <div className="border-b border-white/10 bg-background px-4 py-2.5">
        <p className="text-sm text-primary/90 [text-wrap:balance]">“{s.say}”</p>
        <p className="mt-1 text-xs text-muted">{s.do.join("  ·  ")}</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        {/* Teléfono */}
        <section className="flex min-h-0 flex-col items-center gap-2" aria-label={`Teléfono de ${phone.name}`}>
          <div className="flex gap-1.5">
            {(["asistente", "amiga"] as DemoRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setPhoneRole(r)}
                aria-pressed={phoneRole === r}
                className={cn("min-h-[32px] rounded-full px-3 font-display text-xs font-semibold", phoneRole === r ? "bg-rouge text-white" : "bg-white/[0.06] text-muted hover:text-primary")}
              >
                📱 {DEMO_ROLES[r].name}
              </button>
            ))}
          </div>
          <div ref={phoneBox} className="flex min-h-0 w-full flex-1 items-start justify-center lg:w-[420px]">
            <div style={{ width: (PHONE.w + 20) * scale, height: (PHONE.h + 20) * scale }}>
              <div className="origin-top-left rounded-[2.6rem] border-[10px] border-surface-raised bg-background shadow-[0_0_60px_rgba(255,30,86,0.25)]" style={{ width: PHONE.w + 20, height: PHONE.h + 20, transform: `scale(${scale})` }}>
                {!resetting && <iframe
                  key={`${phoneRole}-${nonce}`}
                  name={FRAME_PERSONA_PREFIX + phone.id}
                  src={phonePath}
                  title={`App de ${phone.name}`}
                  className="size-full rounded-[2rem] bg-background"
                />}
              </div>
            </div>
          </div>
        </section>

        {/* Panel */}
        <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-background" aria-label={`Panel de ${panel.label}`}>
          <div className="flex items-center gap-2 border-b border-white/10 bg-surface/60 px-4 py-2 text-xs text-muted">
            <span className="size-2 rounded-full bg-vip" /> {panel.emoji} {panel.name} · {panel.label}
            <span className="ml-auto font-mono">{panelPath}</span>
          </div>
          {!resetting && <iframe key={`${panelRole}-${nonce}`} name={FRAME_PERSONA_PREFIX + panel.id} src={panelPath} title={`Panel de ${panel.label}`} className="min-h-0 w-full flex-1 bg-background" />}
        </section>
      </div>
    </div>
  );
}
