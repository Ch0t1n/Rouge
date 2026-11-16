"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "../core/gsap";
import { SplitReveal } from "../fx/SplitReveal";
import { PhoneFrame, SCREENS } from "./PhoneMock";
import { cn } from "@/lib/utils";

const PILLARS = [
  {
    tag: "01 / EL LOBBY DE LA FIESTA",
    title: "Conocé gente por música y mood, no por azar.",
    tone: "rouge" as const,
    body: "Horas antes de la fiesta (hasta 48 hs, si el organizador quiere) entrás con el link de tu entrada, elegís tu Mood de la noche y ves a los demás asistentes ordenados por afinidad musical con tu Spotify. Conectar es mutuo, y tenés una sola bala para hablarle directo a alguien: el Rompehielos.",
    bullets: ["Grilla por % de afinidad musical", "Mood de la noche", "1 Rompehielos por fiesta (con trago de regalo opcional)"],
  },
  {
    tag: "02 / SQUADS Y SEGURIDAD",
    title: "Nunca más pierdas a tus amigos en el boliche.",
    tone: "squad" as const,
    body: "Armá tu Squad privado con un link y compartan chat grupal con fotos, Mesa VIP y un Punto Base para reencontrarse. Si llegan 4 o más antes de la hora que fija la fiesta, cada integrante desbloquea un QR de trago gratis.",
    bullets: ["🚨 Rescate a mi Pin: alerta al Squad en 1 toque", "🏠 Ya llegué a casa: borra pines y avisa", "QR Drops por Squad completo"],
  },
  {
    tag: "03 / PLANO PIN-DROP 15 MIN",
    title: "Tu ubicación adentro del boliche, sin GPS.",
    tone: "squad" as const,
    body: "El GPS no entra a un subsuelo lleno de gente. En ROUGE tocás el plano real del lugar y dejás un pin que vence a los 15 minutos. Vos elegís quién lo ve: tu Squad (en cian) y solo los Matches que selecciones (en rojo).",
    bullets: ["Pin manual con precisión de sector", "Se borra solo a los 15 minutos", "Nunca se comparte con Matches que no elegiste"],
  },
  {
    tag: "04 / CADUCIDAD Y PRIVACIDAD",
    title: "Lo que pasa en la fiesta, queda bajo tu control.",
    tone: "rouge" as const,
    body: "Efecto Cenicienta: el lobby se cierra unas horas después de la fiesta (por ejemplo, 24 hs) y solo quedan tus Matches y sus chats. Activá el Modo Solo Amigos para desaparecer de la grilla y bloqueá números de teléfono antes de llegar: ni vos ves a esa persona ni ella a vos.",
    bullets: ["Lobby con fecha de vencimiento", "Ghost Mode (Modo Solo Amigos)", "Bloqueo preventivo por teléfono"],
  },
];

const TONE = { rouge: "text-rouge", squad: "text-squad", vip: "text-vip" };

/**
 * Scrollytelling fijado: en desktop el teléfono queda clavado (ScrollTrigger `pin`) y cambia de
 * pantalla según el bloque de la derecha que cruza el centro. En mobile cada bloque trae su pantalla.
 */
export function Pillars() {
  const root = useRef<HTMLElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const tiltEl = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        ScrollTrigger.create({ trigger: "[data-pillars-track]", start: "top top", end: "bottom bottom", pin: phone.current, pinSpacing: false, invalidateOnRefresh: true });
        if (!prefersReducedMotion() && tiltEl.current) {
          gsap.fromTo(tiltEl.current, { rotateY: 18, rotateX: 6 }, { rotateY: -14, rotateX: -4, ease: "none", scrollTrigger: { trigger: "[data-pillars-track]", start: "top top", end: "bottom bottom", scrub: 1 } });
        }
      });
      gsap.utils.toArray<HTMLElement>("[data-pillar]", root.current).forEach((el, i) => {
        ScrollTrigger.create({ trigger: el, start: "top center", end: "bottom center", onToggle: (self) => self.isActive && setActive(i) });
        if (!prefersReducedMotion())
          gsap.from(el.querySelectorAll("[data-pillar-fade]"), { autoAlpha: 0, y: 30, stagger: 0.08, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 70%", once: true } });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  const Screen = SCREENS[active];
  return (
    <section ref={root} id="experiencia" data-stage="1" className="relative scroll-mt-20 px-4 pt-28 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted">[ 01 {"//"} CÓMO FUNCIONA ]</p>
      <SplitReveal lines={["LOS 4 PILARES", { text: "DE TU NOCHE.", className: "text-outline" }]} className="mt-4 font-display text-[13vw] font-bold uppercase leading-[0.85] tracking-tighter lg:text-[8.5vw]" />
      <p className="mt-6 max-w-xl text-muted">
        Se abren con el link de tu entrada y se cierran cuando termina la fiesta: conocer gente, cuidar a tu grupo, ubicarte adentro del boliche y decidir quién te ve.
      </p>

      <div data-pillars-track className="relative mt-10 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        {/* Columna fija (desktop) */}
        <div className="hidden lg:block">
          <div ref={phone} className="flex h-screen items-center justify-center">
            <div className="w-[min(320px,38vh)] [perspective:1400px]">
              <div ref={tiltEl} className="[transform-style:preserve-3d]">
                <PhoneFrame glow={PILLARS[active].tone}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={active}
                      className="h-full"
                      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -24, filter: "blur(6px)" }}
                      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
                    >
                      <Screen />
                    </motion.div>
                  </AnimatePresence>
                </PhoneFrame>
                <div className="mt-6 flex justify-center gap-2">
                  {PILLARS.map((p, i) => (
                    <span key={p.tag} className={cn("h-1 rounded-full transition-all duration-500", i === active ? "w-10 bg-rouge" : "w-3 bg-white/20")} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bloques */}
        <div>
          {PILLARS.map((p, i) => {
            const S = SCREENS[i];
            return (
              <article key={p.tag} data-pillar className="flex min-h-[85vh] flex-col justify-center py-12 lg:min-h-screen">
                <p data-pillar-fade className={cn("font-mono text-xs uppercase tracking-[0.25em]", TONE[p.tone])}>
                  [{p.tag}]
                </p>
                <h3 data-pillar-fade className="mt-4 max-w-xl font-display text-4xl font-bold uppercase leading-[0.92] tracking-tighter sm:text-6xl">
                  {p.title}
                </h3>
                <p data-pillar-fade className="mt-6 max-w-lg text-base text-muted sm:text-lg">
                  {p.body}
                </p>
                <ul data-pillar-fade className="mt-6 grid max-w-lg gap-2">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-3 border-t border-white/10 pt-2 text-sm">
                      <span className={cn("font-mono text-[10px]", TONE[p.tone])}>✦</span> {b}
                    </li>
                  ))}
                </ul>
                <div className="mx-auto mt-10 w-[240px] lg:hidden">
                  <PhoneFrame glow={p.tone}>
                    <S />
                  </PhoneFrame>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
