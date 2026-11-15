import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Páginas para anfitriones: se comparten por link, no se indexan. */
export const metadata: Metadata = {
  title: "Demo en vivo para anfitriones",
  description: "Mostrá ROUGE en vivo: guion de 7 minutos, cada rol a un toque y modo presentador.",
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
