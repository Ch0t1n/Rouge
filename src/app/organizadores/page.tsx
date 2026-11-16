import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

/**
 * Sitio para organizadores (dueños de boliches, productoras, fiestas): CRM, ventas, barra, RRPP, puerta y planes.
 * OCULTO a propósito: no se indexa y la landing pública ("/") no lo enlaza. Se comparte por link.
 */
export const metadata: Metadata = {
  title: "ROUGE para organizadores",
  description: "La app de la fiesta para tus invitados y el panel para operar y vender más.",
  robots: { index: false, follow: false },
};

export default function OrganizersPage() {
  return <Landing audience="organizers" />;
}
