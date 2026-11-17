"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { SunMedium, WifiOff } from "lucide-react";
import type { UUID } from "@/lib/types";
import { dynamicQrValue, myCredentialSecret, QR_STEP_MS, qrProgress, qrSecondsLeft, type QrKind } from "@/lib/engine/qr";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";

/**
 * QR DINÁMICO anti-captura: se regenera cada 20 s (TOTP) y lo rodea un anillo que se vacía en vivo. El guardia o el
 * bartender ven que la pantalla está "viva" (anillo moviéndose + segundos) y una captura deja de servir enseguida.
 */
export function DynamicQr({ eventId, kind, refId, size = 232, label, dimmed = false, tone = "vip" }: { eventId: UUID; kind: QrKind; refId: string; size?: number; label?: string; dimmed?: boolean; tone?: "vip" | "squad" | "rouge" }) {
  const { state } = useRouge();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (dimmed) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      // ~10 fps alcanza para un anillo fluido sin gastar batería.
      if (t - last > 100) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dimmed]);
  const secret = myCredentialSecret(state, eventId, kind, refId);
  if (!secret) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-muted">
        <WifiOff className="size-6" /> Conectate un momento para cargar tu QR en vivo.
      </div>
    );
  }
  const value = dynamicQrValue(secret, kind, refId, now);
  const left = qrSecondsLeft(now);
  const progress = qrProgress(now);
  const box = size + 32 + 24; // QR + padding blanco + anillo
  const r = box / 2 - 6;
  const circ = 2 * Math.PI * r;
  const color = tone === "squad" ? "#00F0FF" : tone === "rouge" ? "rgb(var(--c-rouge))" : "rgb(var(--c-vip))";
  return (
    <div className="flex flex-col items-center gap-3" data-testid="dynamic-qr" data-kind={kind}>
      <div className="relative" style={{ width: box, height: box }}>
        <svg className="absolute inset-0 -rotate-90" width={box} height={box} aria-hidden>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={5} />
          {!dimmed && <circle cx={box / 2} cy={box / 2} r={r} fill="none" style={{ stroke: color }} strokeWidth={5} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * progress} />}
        </svg>
        <div className={cn("absolute inset-3 grid place-items-center rounded-3xl bg-white p-4", dimmed && "opacity-30 grayscale")}>
          <QRCodeSVG value={value} size={size} level="M" bgColor="#FFFFFF" fgColor="#070709" aria-label={label ?? "Código QR en vivo"} />
        </div>
      </div>
      {!dimmed && (
        <>
          <p className="flex items-center gap-2 font-display text-sm font-semibold" role="timer" aria-live="off">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-squad opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-squad" />
            </span>
            EN VIVO · cambia en <span className="metric w-5 text-center">{left}</span>s
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <SunMedium className="size-3.5" /> Subí el brillo. Las capturas no sirven: el código cambia cada {QR_STEP_MS / 1000} s.
          </p>
        </>
      )}
    </div>
  );
}
