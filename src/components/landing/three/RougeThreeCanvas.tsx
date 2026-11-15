"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import type { Tier } from "./Scene";
import { prefersReducedMotion } from "../core/gsap";

// Three.js solo se descarga en la landing y en el cliente (no entra en el bundle de /app ni /admin).
const Scene = dynamic(() => import("./Scene"), { ssr: false });

function detectTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.innerWidth < 768;
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  return coarse || small || weak ? "low" : "high";
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Si WebGL falla, la landing sigue funcionando con el fondo CSS (nunca una pantalla rota). */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Escenario 3D persistente de fondo: fijo, detrás del contenido y sin capturar el puntero
 * (la escena lee el mouse desde `scrollState`).
 */
export function RougeThreeCanvas() {
  const [cfg, setCfg] = useState<{ tier: Tier; reduced: boolean } | null>(null);
  useEffect(() => {
    if (hasWebGL()) setCfg({ tier: detectTier(), reduced: prefersReducedMotion() });
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Fondo CSS (también es el fallback sin WebGL) */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute left-1/2 top-1/3 size-[60vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rouge/10 blur-[120px]" />
      </div>
      {cfg && (
        <SceneBoundary>
          <div className="absolute inset-0 animate-in fade-in duration-1000">
            <Scene tier={cfg.tier} reduced={cfg.reduced} />
          </div>
        </SceneBoundary>
      )}
      {/* Viñeta para que el texto siempre tenga contraste sobre la escena */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(7,7,9,0.75)_100%)]" />
    </div>
  );
}
