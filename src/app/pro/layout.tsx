import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";

/** Fuentes de ROUGE PRO: se cargan solo en /pro (la app y la landing de la noche no las descargan). */
const pro = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-pro", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-pro-mono", display: "swap" });

export default function ProLayout({ children }: { children: ReactNode }) {
  return <div className={`${pro.variable} ${mono.variable}`}>{children}</div>;
}
