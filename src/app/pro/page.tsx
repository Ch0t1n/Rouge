import type { Metadata, Viewport } from "next";
import { ProLanding } from "@/components/pro/ProLanding";

/** ROUGE PRO: vertical corporativa (congresos, ferias, offsites, coworks). Pública e indexable. */
export const metadata: Metadata = {
  title: { absolute: "ROUGE PRO | Plataforma Integral para Eventos Corporativos y Networking" },
  description:
    "Acreditación instantánea con QR, reuniones 1 a 1 con asignación de salas, mapas indoor y analítica en tiempo real para congresos, ferias, eventos internos y comunidades.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "ROUGE PRO | Plataforma Integral para Eventos Corporativos y Networking",
    description: "Acreditación con QR, networking con salas y analítica en vivo para eventos corporativos.",
    type: "website",
    locale: "es_AR",
    siteName: "ROUGE PRO",
  },
  twitter: { card: "summary_large_image", title: "ROUGE PRO", description: "El sistema operativo para eventos corporativos, congresos y networking." },
};

export const viewport: Viewport = { themeColor: "#0B1120" };

export default function ProPage() {
  return <ProLanding />;
}
