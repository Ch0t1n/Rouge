"use client";

import { createContext, useContext } from "react";

/**
 * Para quién es la landing:
 *  - "public":     ruta "/" — asistentes. Solo beneficios para el público (nada de CRM, ventas ni planes).
 *  - "organizers": ruta "/organizadores" — oculta (noindex y sin links desde "/"), para mandar a dueños y productoras.
 */
export type LandingAudience = "public" | "organizers";

const Ctx = createContext<LandingAudience>("public");
export const AudienceProvider = Ctx.Provider;
export const useAudience = () => useContext(Ctx);

/** Demo para anfitriones: el sitio de demostración si está configurado, si no la de este mismo sitio. */
export const DEMO_HREF = process.env.NEXT_PUBLIC_DEMO_URL ? `${process.env.NEXT_PUBLIC_DEMO_URL.replace(/\/$/, "")}/demo` : "/demo";
