import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { VercelAnalytics } from "@/components/layout/VercelAnalytics";
import { RougeProvider } from "@/lib/store/RougeContext";
import { APP_NAME, SITE_URL } from "@/lib/brand";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Por defecto nada se indexa (app, panel, login, links de entrada): solo la landing "/" lo habilita (src/app/page.tsx).
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: APP_NAME, locale: "es_AR" },
  twitter: { card: "summary_large_image" },
  title: { default: "Rouge Pass — La noche, conectada", template: "%s · Rouge Pass" },
  description: "La app para fiestas y boliches: conocé gente afín, no pierdas a tu grupo y pedí tragos sin hacer fila. Entrás con tu entrada.",
  applicationName: "Rouge Pass",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Rouge Pass", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#070709",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render por request: Next aplica a sus scripts el nonce de la CSP que arma src/proxy.ts.
  // Una página estática no tendría nonce y la CSP estricta la bloquearía.
  await connection();
  return (
    <html lang="es-AR" className={`${display.variable} ${body.variable}`}>
      <body>
        <RougeProvider>
          <AppShell>{children}</AppShell>
        </RougeProvider>
        <ServiceWorkerRegister />
        <VercelAnalytics />
      </body>
    </html>
  );
}
