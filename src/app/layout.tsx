import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { VercelAnalytics } from "@/components/layout/VercelAnalytics";
import { RougeProvider } from "@/lib/store/RougeContext";
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
  title: { default: "ROUGE — La noche, conectada", template: "%s · ROUGE" },
  description: "Lobby privado de tu fiesta: conectá con gente afín, no pierdas a tu Squad y pedí en la barra sin filas.",
  applicationName: "ROUGE",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ROUGE", statusBarStyle: "black-translucent" },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
