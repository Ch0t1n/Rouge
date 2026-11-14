"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";

const TONE = {
  info: "border-white/15",
  success: "border-squad/40",
  error: "border-rouge/50",
  rouge: "border-rouge/60 shadow-glow-rouge",
  squad: "border-squad/50 shadow-glow-squad",
  vip: "border-vip/60 shadow-glow-vip",
};
const BAR = { info: "bg-muted", success: "bg-squad", error: "bg-rouge", rouge: "bg-rouge", squad: "bg-squad", vip: "bg-vip" };

/** Banners Toast superiores (errores, Text Blasts, alertas de rescate). */
export function Toaster() {
  const { toasts, dismiss } = useRouge();
  // En el panel del organizador (vista expandida) los avisos van arriba a la derecha, sin tapar títulos.
  const admin = (usePathname() ?? "").startsWith("/admin");
  return (
    <div
      className={cn(
        "pointer-events-none fixed top-0 z-[60] flex flex-col gap-2 px-3 pt-[max(0.75rem,var(--safe-top))]",
        admin ? "right-0 w-full max-w-sm" : "inset-x-0 mx-auto max-w-md",
      )}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" || t.tone === "rouge" ? "alert" : "status"}
          className={cn("glass pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl py-3 pl-4 pr-2 animate-toast-in", TONE[t.tone])}
        >
          <span className={cn("absolute inset-y-0 left-0 w-1", BAR[t.tone])} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-primary">{t.title}</p>
            {t.description && <p className="mt-0.5 text-[13px] text-muted">{t.description}</p>}
            {t.cta && (
              <Link href={t.cta.href} onClick={() => dismiss(t.id)} className="mt-2 inline-flex min-h-[32px] items-center rounded-full bg-white/10 px-3 text-xs font-semibold text-primary">
                {t.cta.label}
              </Link>
            )}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:text-primary">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
