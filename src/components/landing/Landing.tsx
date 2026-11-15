"use client";

import { useSmoothScroll } from "./core/useSmoothScroll";
import { Cursor } from "./fx/Cursor";
import { RougeThreeCanvas } from "./three/RougeThreeCanvas";
import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { Marquee } from "./sections/Marquee";
import { Pillars } from "./sections/Pillars";
import { ClubMap } from "./sections/ClubMap";
import { SmartBar } from "./sections/SmartBar";
import { B2B } from "./sections/B2B";
import { Pricing } from "./sections/Pricing";
import { Footer } from "./sections/Footer";

/**
 * Landing comercial 3D (ruta "/").
 *
 * Capas (de atrás hacia adelante):
 *  1. `RougeThreeCanvas` — escena R3F fija que se transforma según la sección en pantalla
 *     (`data-stage` 0 Hero · 1 Experiencia · 2 Plano/Barra · 3 B2B/Cierre).
 *  2. Contenido (z-10) con scroll suave Lenis + GSAP ScrollTrigger.
 *  3. Grano cinematográfico (SVG noise al 3%) y cursor magnético (solo desktop).
 *
 * Al salir de la landing (a /app o /admin) todo se desmonta: Lenis, ticker, triggers y WebGL.
 */
export function Landing() {
  useSmoothScroll();
  return (
    <div className="landing-root relative overflow-x-clip">
      <RougeThreeCanvas />
      <div aria-hidden className="noise-overlay pointer-events-none fixed inset-0 z-[60]" />
      <Cursor />
      <Nav />
      <main className="relative z-10">
        <Hero />
        <Marquee />
        <Pillars />
        <ClubMap />
        <SmartBar />
        <B2B />
        <Pricing />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
