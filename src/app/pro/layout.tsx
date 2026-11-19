import type { ReactNode } from "react";
import { proFontVars } from "@/components/pro/fonts";

/** Fuentes de ROUGE PRO: se cargan solo en /pro y en las piezas ejecutivas de eventos corporativos. */
export default function ProLayout({ children }: { children: ReactNode }) {
  return <div className={proFontVars}>{children}</div>;
}
