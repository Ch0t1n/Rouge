import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { FAQ_PUBLIC, SEO } from "@/components/landing/content";
import { APP_NAME, SITE_INDEXABLE, SITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: SEO.title },
  description: SEO.description,
  alternates: { canonical: "/" },
  // Única página indexable del sitio (el resto hereda noindex del layout); el sitio demo y los previews tampoco.
  robots: SITE_INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  keywords: ["app para fiestas", "app para boliches", "conocer gente en una fiesta", "app de discotecas", "pedir tragos sin fila", "no perder a tus amigos en el boliche", "dividir la cuenta"],
  openGraph: { title: SEO.ogTitle, description: SEO.ogDescription, url: "/" },
  twitter: { card: "summary_large_image", title: SEO.ogTitle, description: SEO.ogDescription },
};

/** Datos estructurados (schema.org) de la landing: organización, sitio, la app y las preguntas frecuentes. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: APP_NAME, url: `${SITE_URL}/`, logo: `${SITE_URL}/icons/icon-512.png`, slogan: "La noche, conectada" },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: APP_NAME, url: `${SITE_URL}/`, inLanguage: "es-AR", publisher: { "@id": `${SITE_URL}/#org` } },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: APP_NAME,
      url: `${SITE_URL}/`,
      description: SEO.description,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web (iOS, Android y escritorio)",
      browserRequirements: "Requiere un navegador moderno con JavaScript",
      inLanguage: "es",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "ARS" },
      featureList: [
        "Lobby privado de la fiesta con grilla por afinidad musical",
        "Squads para no perder a tu grupo, con alerta de Rescate",
        "Plano del boliche con pines de 15 minutos",
        "Barra Express: pedidos sin fila con retiro por QR o delivery a la mesa",
        "Cuentas de la mesa para dividir gastos con tu grupo",
      ],
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: FAQ_PUBLIC.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

/** Landing pública (ancho completo, sin sesión). La app del asistente vive en /app. */
export default function HomePage() {
  return (
    <>
      {/* "<" escapado: el JSON nunca puede cerrar el <script>. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <Landing />
    </>
  );
}
