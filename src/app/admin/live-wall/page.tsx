"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Maximize, X } from "lucide-react";
import { liveWallData } from "@/lib/engine/analytics";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/brand/BrandTheme";
import { eventTheme } from "@/lib/engine/branding";

/** Número que "cuenta" hasta el valor nuevo (efecto marcador). */
function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export default function LiveWallPage() {
  const { state } = useRouge();
  const now = useNow(5_000);
  const data = useMemo(() => liveWallData(state, state.active_event_id, now), [state, now]);
  const matches = useCountUp(data.metrics.matches);
  const attendees = useCountUp(data.metrics.attendees);
  const [isFull, setIsFull] = useState(false);
  const [origin, setOrigin] = useState("");
  const [slide, setSlide] = useState(0);
  const { event, metrics, lineup, flash, lastRaffle } = data;
  const joinUrl = `${origin}/join/${event.slug}`;
  const theme = eventTheme(state, event.id);

  useEffect(() => {
    setOrigin(window.location.origin);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Carrusel de anuncios cada 8 s
  const announcements = [
    flash && { key: "flash", node: <Announcement tone="vip" kicker={`⚡ Flash Promo · quedan ${Math.max(0, Math.ceil((+new Date(flash.expires_at!) - now) / 60_000))} min`} title={flash.title.replace(/^⚡\s*/, "")} text={flash.message} /> },
    lastRaffle?.winner && {
      key: "raffle",
      node: (
        <div className="flex items-center gap-[2vw]">
          <Avatar profile={lastRaffle.winner} size={150} ring="vip" />
          <div>
            <p className="font-display text-[1.4vw] font-bold uppercase tracking-[0.3em] text-vip">🏆 Ganó el sorteo</p>
            <p className="font-display text-[4.2vw] font-bold leading-none text-glow-vip">{lastRaffle.winner.full_name.split(" ")[0]}</p>
            <p className="mt-2 text-[1.6vw] text-primary/80">{lastRaffle.raffle.prize_title}</p>
          </div>
        </div>
      ),
    },
    { key: "squad", node: <Announcement tone="squad" kicker="👯 Armá tu Squad" title="Squads de 4+ = trago de bienvenida" text="Encontrá a tus amigas en el plano y usá el Botón de Rescate si lo necesitás." /> },
    { key: "bar", node: <Announcement tone="rouge" kicker="🍸 Barra Express" title="Pedí sin hacer fila" text="Desde la app: delivery a tu pin o retiro por QR en la ventanilla rápida." /> },
  ].filter(Boolean) as { key: string; node: React.ReactNode }[];

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => s + 1), 8000);
    return () => clearInterval(t);
  }, []);
  const current = announcements[slide % announcements.length];

  return (
    <main className="fixed inset-0 z-[100] overflow-hidden bg-background text-primary">
      {/* Fondo neón */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[10vw] -top-[10vw] size-[45vw] rounded-full bg-rouge/25 blur-[140px] animate-pulse" />
        <div className="absolute -bottom-[15vw] -right-[10vw] size-[45vw] rounded-full bg-squad/15 blur-[140px] animate-pulse [animation-delay:1.5s]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:4vw_4vw]" />
      </div>

      {!isFull && (
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="glass flex min-h-touch items-center gap-2 rounded-full px-4 text-sm font-semibold">
            <Maximize className="size-4" /> Pantalla completa
          </button>
          <Link href="/admin" aria-label="Salir del modo pantalla" className="glass grid size-11 place-items-center rounded-full">
            <X className="size-5" />
          </Link>
        </div>
      )}

      <div className="relative grid h-full grid-cols-12 grid-rows-[auto_minmax(0,1.6fr)_minmax(0,1fr)] gap-[min(1.6vw,2.4vh)] p-[min(2.4vw,3.6vh)]">
        {/* Header */}
        <header className="col-span-12 flex items-center justify-between">
          <div className="flex items-baseline gap-[1.5vw]">
            {theme.logo_url ? (
              <BrandLogo theme={theme} className="h-[min(5vw,9vh)] max-w-[22vw] self-center" />
            ) : (
              <span className="font-display text-[4vw] font-bold leading-none tracking-tight text-rouge text-glow-rouge animate-neon-flicker">ROUGE</span>
            )}
            <span className="font-display text-[1.8vw] font-semibold text-primary/90">{event.name}</span>
          </div>
          <div className="flex items-center gap-[1vw] font-display text-[1.6vw] font-bold">
            <span className="flex items-center gap-2 rounded-full bg-rouge px-[1vw] py-[0.3vw] text-white shadow-glow-rouge">
              <span className="size-[0.8vw] animate-ping rounded-full bg-white" /> EN VIVO
            </span>
            <span className="tabular-nums text-muted">{formatTime(new Date(now).toISOString())}</span>
          </div>
        </header>

        {/* Matches */}
        <section className="col-span-5 flex min-h-0 flex-col justify-center overflow-hidden rounded-[2vw] border border-rouge/40 bg-rouge/[0.07] p-[2.4vw] shadow-[0_0_80px_rgb(var(--c-rouge)/0.25)]">
          <p className="font-display text-[1.6vw] font-bold uppercase tracking-[0.3em] text-rouge">Matches de la noche</p>
          <p className="font-display text-[min(13vw,24vh)] font-bold leading-[0.85] tabular-nums text-glow-rouge">{matches}</p>
          <p className="mt-[1vw] text-[1.6vw] text-primary/85">
            🔥 +{data.matchesLastHour} en la última hora · {attendees} personas en el lobby
          </p>
        </section>

        {/* DJ + Squad */}
        <section className="col-span-4 grid min-h-0 grid-rows-2 gap-[min(1.6vw,2.4vh)]">
          <div className="flex min-h-0 flex-col justify-center overflow-hidden rounded-[2vw] border border-white/10 bg-surface/80 px-[2vw] py-[min(1.6vw,2.4vh)]">
            <p className="font-display text-[1.2vw] font-bold uppercase tracking-[0.3em] text-muted">🔊 En cabina</p>
            <p className="mt-[0.4vh] truncate font-display text-[min(2.4vw,4.4vh)] font-bold leading-[1.15]">{lineup.current?.artist ?? "Cabina en pausa"}</p>
            {lineup.next && <p className="mt-[0.5vw] text-[1.4vw] text-muted">Sigue: {lineup.next.artist} · {formatTime(lineup.next.starts_at)}</p>}
            <div className="mt-[1.2vh] flex h-[min(2.5vw,3.5vh)] shrink-0 items-end gap-[0.4vw]" aria-hidden>
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i} className="w-[0.6vw] origin-bottom rounded-full bg-rouge animate-eq-bar" style={{ height: "100%", animationDelay: `${(i * 0.13) % 0.9}s` }} />
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col justify-center overflow-hidden rounded-[2vw] border border-squad/40 bg-squad/[0.07] p-[2vw]">
            <p className="font-display text-[1.2vw] font-bold uppercase tracking-[0.3em] text-squad">👑 Squad más grande</p>
            <p className="mt-[0.5vw] truncate font-display text-[2.6vw] font-bold leading-tight text-glow-squad">{metrics.biggestSquad?.name ?? "¡Armá el tuyo!"}</p>
            <p className="text-[1.6vw] text-primary/85">{metrics.biggestSquad ? `${metrics.biggestSquad.size} integrantes · ${metrics.squads} squads en total` : "Squads de 4+ desbloquean tragos"}</p>
          </div>
        </section>

        {/* QR */}
        <section className="col-span-3 row-span-2 flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-[2vw] border border-vip/40 bg-vip/[0.06] p-[2vw] text-center shadow-[0_0_80px_rgb(var(--c-vip)/0.18)]">
          <p className="font-display text-[1.6vw] font-bold leading-tight">Escaneá y entrá al lobby</p>
          <div className="mt-[1.2vw] rounded-[1.4vw] bg-white p-[1vw]">
            {origin && <QRCodeSVG value={joinUrl} size={512} level="M" bgColor="#FFFFFF" fgColor="#070709" className="size-[min(17vw,38vh)]" aria-label="QR para entrar al lobby" />}
          </div>
          <p className="mt-[1vw] font-display text-[1.3vw] font-semibold text-vip">{joinUrl.replace(/^https?:\/\//, "")}</p>
          <p className="mt-[0.4vw] text-[1.1vw] text-muted">Conectá con gente afín · encontrá a tu Squad · pedí sin fila</p>
        </section>

        {/* Temas */}
        <section className="col-span-4 min-h-0 overflow-hidden rounded-[2vw] border border-white/10 bg-surface/80 p-[2vw]">
          <p className="font-display text-[1.2vw] font-bold uppercase tracking-[0.3em] text-muted">🎶 Lo que pide la pista</p>
          <ol className="mt-[1.2vh] space-y-[1vh]">
            {metrics.topSongs.slice(0, 3).map((s, i) => (
              <li key={s.id} className="flex items-center gap-[1vw]">
                <span className={cn("w-[2vw] font-display text-[min(2.2vw,4vh)] font-bold leading-none", i === 0 ? "text-rouge text-glow-rouge" : "text-muted")}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-display text-[min(1.6vw,3vh)] font-bold">{s.title}</span>
                  <span className="text-[min(1.1vw,2vh)] text-muted"> · {s.artist}</span>
                </span>
                <span className="font-display text-[min(1.5vw,2.8vh)] font-bold tabular-nums text-rouge">{s.voter_ids.length}▲</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Anuncios rotativos */}
        <section key={current?.key} className="col-span-5 flex min-h-0 items-center overflow-hidden rounded-[2vw] border border-white/10 bg-surface/80 p-[2vw] animate-in fade-in slide-in-from-bottom-4 duration-700">
          {current?.node}
        </section>
      </div>
    </main>
  );
}

function Announcement({ tone, kicker, title, text }: { tone: "vip" | "squad" | "rouge"; kicker: string; title: string; text: string }) {
  const color = { vip: "text-vip", squad: "text-squad", rouge: "text-rouge" }[tone];
  const glow = { vip: "text-glow-vip", squad: "text-glow-squad", rouge: "text-glow-rouge" }[tone];
  return (
    <div>
      <p className={cn("font-display text-[1.3vw] font-bold uppercase tracking-[0.3em]", color)}>{kicker}</p>
      <p className={cn("mt-[0.4vw] font-display text-[3.2vw] font-bold leading-[1.05]", glow)}>{title}</p>
      <p className="mt-[0.6vw] text-[1.5vw] text-primary/85">{text}</p>
    </div>
  );
}
