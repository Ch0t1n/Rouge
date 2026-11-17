import type { Metadata } from "next";
import { CorporateLanding } from "@/components/corporate/CorporateLanding";

/**
 * Página de ventas B2B de ROUGE Pro (empresas, productoras corporativas, congresos, expos y coworks).
 * Pública e indexable (a diferencia de /organizadores), pero la landing de asistentes ("/") no la enlaza.
 */
export const metadata: Metadata = {
  title: "ROUGE Pro · eventos corporativos conectados y medibles",
  description:
    "Acreditación con QR, networking inteligente con reuniones y salas, privacidad por diseño y CRM post-evento para congresos, expos, eventos internos y comunidades.",
  alternates: { canonical: "/empresas" },
  openGraph: {
    title: "ROUGE Pro · eventos corporativos conectados y medibles",
    description: "Acreditación con QR, networking con reuniones y salas, y métricas reales de tu evento.",
    type: "website",
  },
};

export default function EmpresasPage() {
  return <CorporateLanding />;
}
