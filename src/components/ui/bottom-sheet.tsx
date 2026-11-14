"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal inferior tipo Bottom Sheet. En desktop queda alineado al contenedor
 * móvil centrado (max-w-md) para respetar la "pantalla del teléfono".
 */
export function BottomSheet({ open, onClose, title, description, children, footer, className }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md items-end" role="presentation">
      <button aria-label="Cerrar" className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "glass relative z-10 flex max-h-[88dvh] w-full flex-col rounded-t-[28px] border-b-0 shadow-sheet outline-none animate-sheet-up",
          className,
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/20" aria-hidden />
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
            <div>
              {title && <h2 id={titleId} className="text-lg">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="-mr-2 grid size-11 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-primary">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-white/10 px-5 pb-[max(1rem,var(--safe-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
