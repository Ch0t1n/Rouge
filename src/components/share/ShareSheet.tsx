"use client";

import { useRef, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, MessageCircle, QrCode, Share2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ShareAccent = "rouge" | "squad" | "vip";

const RING: Record<ShareAccent, string> = {
  rouge: "shadow-glow-rouge",
  squad: "shadow-glow-squad",
  vip: "shadow-glow-vip",
};

export interface ShareTarget {
  /** Link absoluto o ruta (`/join/ABC`): se completa con el dominio actual. */
  url: string;
  title: string;
  /** Texto que acompaña al link en WhatsApp / compartir nativo. */
  text?: string;
  /** Nombre del PNG descargado (sin extensión). */
  fileName?: string;
  accent?: ShareAccent;
  /** Línea grande debajo del QR (ej. el código para dictarlo). */
  caption?: ReactNode;
}

export const absoluteUrl = (url: string) => (/^https?:\/\//.test(url) || typeof window === "undefined" ? url : `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`);

/**
 * Hoja para compartir cualquier link de ROUGE: QR de alto contraste (para mostrar
 * en la puerta o en pantalla), compartir nativo, WhatsApp, copiar y descargar PNG
 * (para imprimir o mandar como imagen). Funciona sin conexión salvo el envío.
 */
export function ShareSheet({ open, onClose, target }: { open: boolean; onClose: () => void; target: ShareTarget | null }) {
  const canvasWrap = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  if (!target) return null;
  const link = absoluteUrl(target.url);
  const message = `${target.text ?? target.title}\n${link}`;
  const accent = target.accent ?? "rouge";

  const copy = async () => {
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const share = async () => {
    try {
      await navigator.share({ title: target.title, text: target.text ?? target.title, url: link });
    } catch {
      /* cancelado por el usuario */
    }
  };
  const download = () => {
    const canvas = canvasWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${target.fileName ?? "rouge-qr"}.png`;
    a.click();
  };
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <BottomSheet open={open} onClose={onClose} title={target.title} description="Escaneá el QR o mandá el link.">
      <div className="flex flex-col items-center gap-4">
        <div ref={canvasWrap} className={cn("rounded-3xl bg-white p-4", RING[accent])}>
          {/* Canvas de 1024 px escalado: nítido en pantalla y en el PNG impreso. */}
          <QRCodeCanvas value={link} size={1024} level="M" marginSize={2} bgColor="#FFFFFF" fgColor="#070709" aria-label={`Código QR de ${target.title}`} style={{ width: 220, height: 220 }} />
        </div>
        {target.caption && <div className="text-center font-display text-2xl font-bold tracking-wider">{target.caption}</div>}
        <code className="w-full truncate rounded-xl bg-white/[0.05] px-3 py-2.5 text-center text-xs text-muted">{link}</code>
        <div className="grid w-full grid-cols-2 gap-2">
          {canNativeShare && (
            <Button variant={accent} className="col-span-2" onClick={share}>
              <Share2 /> Compartir
            </Button>
          )}
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "glass" })}>
            <MessageCircle /> WhatsApp
          </a>
          <Button variant="glass" onClick={copy} aria-live="polite">
            {copied ? <Check className="text-squad" /> : <Copy />} {copied ? "Copiado" : "Copiar link"}
          </Button>
          <Button variant="glass" className="col-span-2" onClick={download}>
            <Download /> Descargar QR (PNG)
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

/** Estado + hoja listos para usar: `const share = useShare(); share.open({...}); {share.sheet}` */
export function useShare() {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const [open, setOpen] = useState(false);
  return {
    open: (t: ShareTarget) => {
      setTarget(t);
      setOpen(true);
    },
    sheet: <ShareSheet open={open} onClose={() => setOpen(false)} target={target} />,
  };
}

/** Botón "QR" compacto que abre la hoja de compartir de un link. */
export function ShareButton({ target, label = "Compartir", iconOnly = false, ...props }: { target: ShareTarget; label?: string; iconOnly?: boolean } & Omit<ButtonProps, "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="glass" size={iconOnly ? "icon" : props.size} aria-label={iconOnly ? `${label}: ${target.title}` : undefined} {...props} onClick={() => setOpen(true)}>
        <QrCode /> {!iconOnly && label}
      </Button>
      <ShareSheet open={open} onClose={() => setOpen(false)} target={target} />
    </>
  );
}
