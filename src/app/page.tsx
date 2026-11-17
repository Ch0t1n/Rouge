import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { APP_NAME, APP_TAGLINE, SITE_INDEXABLE, SITE_URL } from "@/lib/brand";

const TITLE = `${APP_NAME} — ${APP_TAGLINE}`;
const DESCRIPTION = "Lobby privado de tu fiesta: conectá con gente afín, no pierdas a tu Squad y pedí en la barra sin filas.";

/** Única página indexable del sitio (el resto hereda noindex del layout). */
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: SITE_INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: { url: "/", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/** Datos estructurados para que Google asocie el nombre "Rouge Pass" con el sitio. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: APP_NAME, url: `${SITE_URL}/`, inLanguage: "es-AR" },
    { "@type": "Organization", name: APP_NAME, url: `${SITE_URL}/`, logo: `${SITE_URL}/icons/icon-512.png` },
  ],
};

/** Landing pública (ancho completo, sin sesión). La app del asistente vive en /app. */
export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <Landing />
    </>
  );
}
