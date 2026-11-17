"use client";

import type { ReactNode } from "react";
import { Bell, Clock3, EyeOff, Flag, Heart, House, Lock, MapPin, Music2, ShieldAlert, Sparkles, Users, Wine } from "lucide-react";
import { cn } from "@/lib/utils";
import { demoAvatar } from "@/lib/demo/photos";

/** Marco de iPhone en modo oscuro (CSS puro: nítido en cualquier resolución). */
export function PhoneFrame({ children, className, glow = "rouge" }: { children: ReactNode; className?: string; glow?: "rouge" | "squad" | "vip" }) {
  return (
    <div
      className={cn(
        "relative aspect-[9/19.2] w-full rounded-[2.9rem] bg-gradient-to-b from-[#2a2a33] via-[#17171d] to-[#0d0d11] p-[7px]",
        { rouge: "shadow-[0_30px_120px_-20px_rgba(255,30,86,0.55)]", squad: "shadow-[0_30px_120px_-20px_rgba(0,240,255,0.45)]", vip: "shadow-[0_30px_120px_-20px_rgba(255,184,0,0.45)]" }[glow],
        className,
      )}
    >
      <div className="relative size-full overflow-hidden rounded-[2.45rem] bg-background ring-1 ring-white/10">
        {/* Dynamic Island */}
        <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
        <div className="absolute inset-x-0 top-0 z-10 flex h-11 items-end justify-between px-6 pb-1 font-display text-[11px] font-semibold">
          <span>01:24</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3.5 rounded-[3px] border border-white/60" />
          </span>
        </div>
        <div className="absolute inset-0 pt-12">{children}</div>
        <div className="absolute bottom-1.5 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-white/50" />
      </div>
    </div>
  );
}

const AV = demoAvatar;

function Card({ user, name, pct, mood }: { user: string; name: string; pct: number; mood: string }) {
  return (
    <div className="relative aspect-card overflow-hidden rounded-2xl bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={AV(user)} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      <div className="card-fade absolute inset-0" />
      <span className="absolute right-1.5 top-1.5 rounded-full bg-rouge px-1.5 py-0.5 font-display text-[9px] font-bold text-white">{pct}%</span>
      <div className="absolute inset-x-1.5 bottom-1.5">
        <p className="font-display text-[11px] font-semibold leading-tight">{name}</p>
        <span className="glass-pill mt-1 inline-block !px-1.5 !py-0.5 !text-[8px]">{mood}</span>
      </div>
    </div>
  );
}

function LobbyScreen() {
  return (
    <div className="flex h-full flex-col px-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-widest text-muted">Lobby · abre 48 hs antes</p>
          <p className="font-display text-base font-bold">Neon Sunday</p>
        </div>
        <Bell className="size-4 text-muted" />
      </div>
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-hidden">
        {["🔥 A full", "🎧 Solo música", "🍸 Tranqui"].map((m, i) => (
          <span key={m} className={cn("shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold", i === 0 ? "border-rouge bg-rouge/15 text-rouge" : "border-white/10 text-muted")}>
            {m}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Card user="mateo.techno" name="Mateo, 27" pct={92} mood="🔥 A full" />
        <Card user="meli.house" name="Meli, 25" pct={88} mood="🎧 Música" />
        <Card user="cami.beats" name="Cami, 24" pct={81} mood="🔥 A full" />
        <Card user="lucas.dj" name="Lucas, 29" pct={77} mood="🍸 Tranqui" />
      </div>
      <div className="mt-auto mb-6 flex items-center gap-2 rounded-2xl border border-rouge/40 bg-rouge/10 p-2.5">
        <Sparkles className="size-4 shrink-0 text-rouge" />
        <p className="text-[10px] leading-tight">
          <span className="font-semibold text-rouge">1 Rompehielos</span> disponible esta noche
        </p>
        <Music2 className="ml-auto size-3.5 text-[#1DB954]" />
      </div>
    </div>
  );
}

function SquadScreen() {
  return (
    <div className="flex h-full flex-col px-3">
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted">Tu Squad</p>
      <p className="font-display text-base font-bold">
        Las Pibas <span className="text-squad">· 4/4</span>
      </p>
      <div className="mt-2 flex -space-x-2">
        {["meli.house", "cami.beats", "juli.rkt", "fran.cachengue"].map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={AV(u)} alt="" className="size-9 rounded-full border-2 border-background object-cover ring-1 ring-squad/60" />
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-vip/40 bg-vip/10 p-2.5">
        <p className="flex items-center gap-1.5 font-display text-[11px] font-bold text-vip">
          <Wine className="size-3.5" /> QR Drop desbloqueado
        </p>
        <p className="mt-0.5 text-[9px] text-muted">Squad de 4 antes de la 01:00 → 1 trago gratis c/u</p>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-surface p-2.5">
        <Flag className="size-4 text-vip" />
        <div className="text-[9px]">
          <p className="font-semibold">Mesa VIP 4 · Punto Base</p>
          <p className="text-muted">Vaquita: 3 de 4 pagaron</p>
        </div>
      </div>
      <div className="mt-auto mb-6 grid gap-1.5">
        <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-rouge py-2.5 font-display text-[11px] font-bold text-white shadow-glow-rouge">
          <ShieldAlert className="size-4" /> 🚨 Rescate a mi Pin
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/15 py-2.5 font-display text-[11px] font-semibold">
          <House className="size-4" /> 🏠 Ya llegué a casa
        </div>
      </div>
    </div>
  );
}

function MapScreen() {
  return (
    <div className="flex h-full flex-col px-3">
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted">Plano · Pin-Drop</p>
      <p className="font-display text-base font-bold">¿Dónde están?</p>
      <div className="relative mt-2 aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-surface-sunken">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.07)_1px,transparent_1px)] bg-[size:14px_14px]" />
        <div className="absolute left-[18%] right-[18%] top-[6%] h-[14%] rounded-lg border border-white/15 bg-white/[0.03] text-center font-mono text-[7px] leading-[2.5] text-muted">CABINA DJ</div>
        <div className="absolute inset-x-[12%] top-[26%] h-[38%] rounded-xl border border-white/10 bg-white/[0.02] text-center font-mono text-[7px] leading-[3] text-muted">PISTA</div>
        <div className="absolute bottom-[6%] left-[6%] h-[20%] w-[38%] rounded-lg border border-vip/40 bg-vip/5 text-center font-mono text-[7px] leading-[3] text-vip">VIP</div>
        <div className="absolute bottom-[6%] right-[6%] h-[20%] w-[38%] rounded-lg border border-white/10 text-center font-mono text-[7px] leading-[3] text-muted">BARRA</div>
        {[
          ["30%", "40%", "bg-squad"],
          ["38%", "48%", "bg-squad"],
          ["44%", "36%", "bg-squad"],
          ["66%", "44%", "bg-rouge"],
        ].map(([l, t, c], i) => (
          <span key={i} className="absolute" style={{ left: l, top: t }}>
            <span className={cn("absolute -inset-1 animate-pin-pulse rounded-full", c)} />
            <span className={cn("relative block size-2.5 rounded-full ring-2 ring-background", c)} />
          </span>
        ))}
        <Flag className="absolute bottom-[12%] left-[22%] size-4 text-vip" />
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-squad/40 bg-squad/10 p-2">
        <MapPin className="size-4 text-squad" />
        <p className="text-[9px]">
          Tu pin vence en <span className="metric text-squad">14:32</span>
        </p>
      </div>
      <div className="mt-1.5 mb-6 flex gap-1.5 text-[9px]">
        <span className="flex-1 rounded-xl bg-squad/15 py-1.5 text-center font-semibold text-squad">● Squad</span>
        <span className="flex-1 rounded-xl bg-rouge/15 py-1.5 text-center font-semibold text-rouge">● 1 Match elegido</span>
      </div>
    </div>
  );
}

function PrivacyScreen() {
  return (
    <div className="flex h-full flex-col px-3">
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted">Privacidad</p>
      <p className="font-display text-base font-bold">Bajo tu control</p>
      <div className="mt-3 rounded-2xl border border-rouge/30 bg-rouge/10 p-3 text-center">
        <p className="flex items-center justify-center gap-1 text-[9px] text-muted">
          <Clock3 className="size-3" /> El lobby se cierra en
        </p>
        <p className="metric mt-0.5 text-2xl text-rouge">23:59:12</p>
        <p className="text-[9px] text-muted">Tus matches y chats quedan para siempre</p>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-surface p-2.5">
        <EyeOff className="size-4 text-squad" />
        <div className="flex-1 text-[9px]">
          <p className="font-semibold">Modo Solo Amigos</p>
          <p className="text-muted">Invisible en la grilla</p>
        </div>
        <span className="flex h-5 w-9 items-center rounded-full bg-squad p-0.5">
          <span className="ml-auto size-4 rounded-full bg-background" />
        </span>
      </div>
      <div className="mt-2 rounded-2xl border border-white/10 bg-surface p-2.5">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold">
          <Lock className="size-3.5 text-rouge" /> Lista negra por teléfono
        </p>
        {["+54 9 11 •••• 4821", "+54 9 11 •••• 0937"].map((n) => (
          <p key={n} className="mt-1.5 flex items-center justify-between rounded-lg bg-white/[0.04] px-2 py-1.5 font-mono text-[9px] text-muted">
            {n} <span className="text-rouge">bloqueado</span>
          </p>
        ))}
      </div>
      <p className="mt-auto mb-6 flex items-center gap-1.5 rounded-2xl bg-white/[0.04] p-2 text-[9px] text-muted">
        <Users className="size-3.5" /> Invisibilidad mutua: ni vos ni ellos se ven.
        <Heart className="ml-auto size-3 text-rouge" />
      </p>
    </div>
  );
}

export const SCREENS = [LobbyScreen, SquadScreen, MapScreen, PrivacyScreen];
