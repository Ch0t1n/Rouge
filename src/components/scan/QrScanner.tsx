"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

/**
 * Escáner de QR con la cámara trasera del celular. Usa el lector nativo del navegador (BarcodeDetector) si existe y,
 * si no (Safari/iPhone), decodifica los cuadros con jsQR. No repite el mismo código por `cooldownMs`.
 * Funciona solo en HTTPS (o localhost) y pide permiso de cámara la primera vez.
 */
export function QrScanner({ onResult, cooldownMs = 2500, className }: { onResult: (text: string) => void; cooldownMs?: number; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const cb = useRef(onResult);
  cb.current = onResult;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError("Este navegador no permite usar la cámara. Tipeá el código abajo.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        return setError("No pudimos abrir la cámara. Dale permiso en el navegador o tipeá el código abajo.");
      }
      if (!alive || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = native ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (!alive || !video.current) return;
        const v = video.current;
        if (v.readyState >= 2 && v.videoWidth) {
          let text: string | null = null;
          try {
            if (native) text = (await native.detect(v))[0]?.rawValue ?? null;
            else if (jsQR && ctx) {
              const w = Math.min(640, v.videoWidth);
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {
            /* cuadro ilegible: se sigue con el próximo */
          }
          const now = Date.now();
          if (text && (text !== last.current.text || now - last.current.at > cooldownMs)) {
            last.current = { text, at: now };
            navigator.vibrate?.(60);
            cb.current(text);
          }
        }
        raf = requestAnimationFrame(() => void tick());
      };
      raf = requestAnimationFrame(() => void tick());
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cooldownMs]);

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-3xl border border-white/10 bg-black", className)}>
      {error ? (
        <div className="grid size-full place-items-center p-6 text-center text-sm text-muted">
          <div>
            <CameraOff className="mx-auto mb-3 size-8" />
            {error}
          </div>
        </div>
      ) : (
        <>
          <video ref={video} muted playsInline className="size-full object-cover" aria-label="Vista de la cámara" />
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-squad/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </>
      )}
    </div>
  );
}
