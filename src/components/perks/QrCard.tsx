"use client";

import { QRCodeSVG } from "qrcode.react";
import { SunMedium } from "lucide-react";
import { cn } from "@/lib/utils";

/** QR grande, alto contraste (fondo blanco) para escanear en la barra con poca luz. */
export function QrBlock({ value, size = 232, dimmed = false, label }: { value: string; size?: number; dimmed?: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("rounded-3xl bg-white p-4 shadow-glow-vip", dimmed && "opacity-30 grayscale")}>
        <QRCodeSVG value={value} size={size} level="M" bgColor="#FFFFFF" fgColor="#070709" aria-label={label ?? "Código QR"} />
      </div>
      {!dimmed && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <SunMedium className="size-3.5" /> Subí el brillo al máximo para escanear
        </p>
      )}
    </div>
  );
}
