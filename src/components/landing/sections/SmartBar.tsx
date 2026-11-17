"use client";

import { QRCodeSVG } from "qrcode.react";
import { Bike, Gift, QrCode, Split } from "lucide-react";
import { SplitReveal } from "../fx/SplitReveal";
import { TiltCard } from "../fx/TiltCard";

function Tag({ children }: { children: string }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">{children}</p>;
}

/** Smart Bar & Perks: grilla asimétrica de tarjetas con tilt 3D y borde luminoso. */
export function SmartBar() {
  return (
    <section id="barra" data-stage="2" className="relative scroll-mt-20 px-4 py-28 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-vip">[ 03 {"//"} BARRA EXPRESS Y PREMIOS ]</p>
      <SplitReveal lines={["CERO FILAS.", { text: "MÁS NOCHE.", className: "text-vip text-glow-vip" }]} className="mt-4 font-display text-[14vw] font-bold uppercase leading-[0.84] tracking-tighter lg:text-[8.5vw]" />
      <p className="mt-6 max-w-xl text-muted">
        Pedí tragos desde el celular sin hacer fila: retirás con QR o te lo llevan a la mesa, y lo que comparten se divide solo entre tu grupo.
      </p>

      <div className="mt-14 grid gap-5 lg:grid-cols-6">
        <div className="lg:col-span-4">
          <TiltCard tone="vip">
            <div className="grid h-full gap-6 p-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-9">
              <div>
                <Tag>Fast-Pickup por QR</Tag>
                <h3 className="mt-3 font-display text-3xl font-bold uppercase tracking-tighter sm:text-5xl">Pedí desde la pista.</h3>
                <p className="mt-3 max-w-md text-muted">Pagás desde el celular, te avisamos cuando tu trago está listo y lo retirás en la ventanilla rápida mostrando tu QR. Diez segundos, no veinte minutos.</p>
                <div className="mt-5 flex flex-wrap gap-2 font-mono text-[11px]">
                  {["Pedido", "En preparación", "Listo para retirar", "Retirado"].map((s, i) => (
                    <span key={s} className={i === 2 ? "rounded-full bg-vip px-2.5 py-1 font-semibold text-background" : "rounded-full border border-white/15 px-2.5 py-1 text-muted"}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mx-auto rounded-3xl bg-white p-4 shadow-glow-vip">
                <QRCodeSVG value="ROUGE:ORDER:demo:K7P2" size={132} bgColor="#FFFFFF" fgColor="#070709" aria-label="QR de retiro de ejemplo" />
                <p className="mt-2 text-center font-display text-lg font-bold tracking-widest text-background">K7P2</p>
              </div>
            </div>
          </TiltCard>
        </div>
        <div className="lg:col-span-2">
          <TiltCard tone="rouge">
            <div className="flex h-full flex-col p-7">
              <Bike className="size-7 text-rouge" />
              <Tag>Delivery</Tag>
              <h3 className="mt-3 font-display text-3xl font-bold uppercase tracking-tighter">A tu pin o a tu Mesa VIP.</h3>
              <p className="mt-3 text-muted">Tu pin en el plano es tu dirección de entrega adentro del boliche.</p>
              <div className="relative mt-auto h-24 pt-6">
                <svg viewBox="0 0 200 60" className="size-full" aria-hidden>
                  <path d="M10 50 C 60 50, 70 10, 120 18 S 180 40, 190 12" fill="none" stroke="#FF1E56" strokeWidth="2" strokeDasharray="5 6" className="animate-[dash_2s_linear_infinite]" />
                  <circle cx="10" cy="50" r="5" fill="#FFB800" />
                  <circle cx="190" cy="12" r="6" fill="#FF1E56" />
                </svg>
              </div>
            </div>
          </TiltCard>
        </div>
        <div className="lg:col-span-2">
          <TiltCard tone="squad">
            <div className="flex h-full flex-col p-7">
              <Split className="size-7 text-squad" />
              <Tag>Vaquita de Squad</Tag>
              <h3 className="mt-3 font-display text-3xl font-bold uppercase tracking-tighter">Dividí la botella en un toque.</h3>
              <div className="mt-6 space-y-2">
                {[
                  ["Meli", 100],
                  ["Cami", 100],
                  ["Juli", 100],
                  ["Fran", 35],
                ].map(([n, v]) => (
                  <div key={n} className="flex items-center gap-3 text-sm">
                    <span className="w-10 text-muted">{n}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-squad" style={{ width: `${v}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TiltCard>
        </div>
        <div className="lg:col-span-4">
          <TiltCard tone="rouge">
            <div className="grid h-full gap-6 p-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-9">
              <div>
                <Gift className="size-7 text-rouge" />
                <Tag>QR Drops & Sorteos en vivo</Tag>
                <h3 className="mt-3 font-display text-3xl font-bold uppercase tracking-tighter sm:text-5xl">Ganá la noche.</h3>
                <p className="mt-3 max-w-md text-muted">Tragos de regalo por llegar temprano con tu Squad y sorteos en vivo en las pantallas del lugar. El ganador sale al azar de verdad: la ruleta solo lo muestra.</p>
              </div>
              <div aria-hidden className="relative mx-auto size-40">
                <div className="absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full bg-[conic-gradient(#FF1E56_0_60deg,#121216_60deg_120deg,#FFB800_120deg_180deg,#121216_180deg_240deg,#00F0FF_240deg_300deg,#121216_300deg_360deg)] shadow-glow-rouge" />
                <div className="absolute inset-[30%] grid place-items-center rounded-full bg-background">
                  <QrCode className="size-6 text-vip" />
                </div>
                <div className="absolute -top-2 left-1/2 size-0 -translate-x-1/2 border-x-[8px] border-t-[14px] border-x-transparent border-t-primary" />
              </div>
            </div>
          </TiltCard>
        </div>
      </div>
    </section>
  );
}
