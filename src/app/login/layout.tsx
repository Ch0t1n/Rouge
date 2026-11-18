import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Login: no se indexa. */
export const metadata: Metadata = {
  title: "Entrar",
  description: "Entrá a Rouge Pass con tu cuenta: asistentes y equipo del evento.",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
