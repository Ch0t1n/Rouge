"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Barra superior de pantallas internas: atrás + título + acciones. */
export function PageHeader({ title, subtitle, action, backHref, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; backHref?: string; className?: string }) {
  const router = useRouter();
  return (
    <header className={cn("safe-top sticky top-0 z-30 flex items-center gap-2 bg-background/85 px-2 pb-2 pt-3 backdrop-blur-xl", className)}>
      <button
        type="button"
        aria-label="Volver"
        onClick={() => (backHref ? router.push(backHref) : window.history.length > 1 ? router.back() : router.push("/app"))}
        className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-white/5"
      >
        <ChevronLeft className="size-6" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 pr-2">{action}</div>}
    </header>
  );
}
