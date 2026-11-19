"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Panel lateral derecho (PC). Se superpone al contenido SIN navegar: la grilla de abajo
 * conserva su scroll. Cierra con Escape, con el fondo o con la X.
 */
export function Drawer({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; className?: string }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button aria-label="Cerrar" className="absolute inset-0 bg-black/40 animate-in fade-in" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn("glass relative z-10 flex h-full w-full max-w-md flex-col border-y-0 border-r-0 shadow-sheet outline-none animate-in slide-in-from-right duration-200", className)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          {title ? <h2 id={titleId} className="truncate text-lg">{title}</h2> : <span />}
          <button onClick={onClose} aria-label="Cerrar panel" className="-mr-2 grid size-11 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-primary">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
