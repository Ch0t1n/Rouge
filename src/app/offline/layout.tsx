import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Fallback del Service Worker: no se indexa. */
export const metadata: Metadata = {
  title: "Sin conexión",
  description: "Sin conexión: Rouge Pass vuelve apenas tengas señal.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
