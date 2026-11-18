"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../core/gsap";
import { SplitReveal } from "../fx/SplitReveal";
import { cn } from "@/lib/utils";

const BENEFITS: { emoji: string; title: string; body: string; tone: "rouge" | "squad" | "vip" }[] = [
  { emoji: "🎟️", title: "Tu entrada en el celular", body: "Entrás con el link o el QR de tu entrada y la mostrás en la puerta desde la app. Sin descargar nada.", tone: "rouge" },
  { emoji: "💘", title: "Conocé gente en la fiesta", body: "Una grilla ordenada por la música que escuchás. Conectar es mutuo: nadie te escribe si vos no querés.", tone: "rouge" },
  { emoji: "⚡", title: "Un Rompehielos por noche", body: "Tu única bala para escribirle directo a alguien. Y si querés, con un trago de regalo.", tone: "rouge" },
  { emoji: "👯", title: "Nunca pierdas a tu grupo", body: "Squad privado, plano del boliche en vivo con pines de 15 minutos y Punto Base para reencontrarse.", tone: "squad" },
  { emoji: "🚨", title: "Rescate en un toque", body: "Si algo no está bien, tu Squad y la seguridad del lugar saben dónde estás al instante.", tone: "squad" },
  { emoji: "🏠", title: "“Llegué a casa”", body: "Un toque y tu grupo sabe que volviste bien. Tus pines se borran.", tone: "squad" },
  { emoji: "🍸", title: "Pedí tragos sin hacer fila", body: "Desde la pista: pagás con Mercado Pago y retirás con QR o te lo llevan a la mesa.", tone: "vip" },
  { emoji: "🎁", title: "Tragos y premios", body: "Llegá con tu Squad completo y desbloqueá tragos de regalo. Participás en sorteos en vivo.", tone: "vip" },
  { emoji: "🧾", title: "Cuentas claras con tu grupo", body: "Lo que comparten se divide solo y al final te decimos cuánto le pasás a quién.", tone: "vip" },
  { emoji: "🎶", title: "Pedí temas al DJ", body: "Votá los temas que querés escuchar y mirá quién está en cabina ahora.", tone: "rouge" },
  { emoji: "💬", title: "Tus matches para siempre", body: "El lobby se cierra después de la fiesta, pero tus matches y sus chats quedan.", tone: "rouge" },
  { emoji: "🔒", title: "Tu privacidad primero", body: "Tu teléfono nunca se muestra, podés ocultarte de la grilla y bloquear números antes de llegar.", tone: "squad" },
];

const TONE = { rouge: "text-rouge border-rouge/30", squad: "text-squad border-squad/30", vip: "text-vip border-vip/30" };

/** Ventajas para el público (solo en la landing "/"). */
export function Benefits() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-benefit]", { autoAlpha: 0, y: 30, stagger: 0.05, duration: 0.8, ease: "expo.out", scrollTrigger: { trigger: root.current, start: "top 75%", once: true } });
    },
    { scope: root },
  );
  return (
    <section ref={root} id="ventajas" data-stage="2" className="relative scroll-mt-20 px-4 py-28 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-rouge">[ 04 {"//"} VENTAJAS PARA ASISTENTES ]</p>
      <SplitReveal lines={["TU NOCHE,", { text: "MEJOR.", className: "text-outline" }]} className="mt-4 font-display text-[14vw] font-bold uppercase leading-[0.84] tracking-tighter lg:text-[8.5vw]" />
      <p className="mt-6 max-w-xl text-muted">Para vos es gratis: lo pone la fiesta. Entrás con tu entrada y tenés todo esto en el celular, sin descargar ninguna app.</p>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => (
          <li key={b.title} data-benefit className={cn("rounded-3xl border bg-background/70 p-6 backdrop-blur-md", TONE[b.tone].split(" ")[1])}>
            <span className="text-3xl" aria-hidden>{b.emoji}</span>
            <h3 className={cn("mt-3 font-display text-2xl font-bold tracking-tight", TONE[b.tone].split(" ")[0])}>{b.title}</h3>
            <p className="mt-2 text-sm text-muted">{b.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
