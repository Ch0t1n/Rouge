import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Fuentes de ROUGE PRO (Inter + JetBrains Mono). Las usan /pro y las piezas ejecutivas de la app en eventos
 * corporativos (ficha, pase y tarjeta vCard). Solo se descargan en las páginas que las renderizan.
 */
const pro = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-pro", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-pro-mono", display: "swap" });

/** Clases que definen --font-pro y --font-pro-mono en el contenedor. */
export const proFontVars = `${pro.variable} ${mono.variable}`;
