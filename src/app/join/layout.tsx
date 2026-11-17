import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Ingreso con código o link de entrada: cada código es privado del evento, no se indexa. */
export const metadata: Metadata = {
  title: "Entrar a la fiesta",
  description: "Ingresá el link o el código de tu entrada para entrar al lobby privado de la fiesta.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
