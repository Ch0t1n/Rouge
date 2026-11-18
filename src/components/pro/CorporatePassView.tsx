"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Contact, DoorOpen, Download, Loader2, Lock, QrCode, RefreshCw, Share2, WifiOff } from "lucide-react";
import type { UUID } from "@/lib/types";
import { PASS_WINDOW_SECONDS, zonesForTier, zonesOf } from "@/lib/engine/door";
import { usePassToken } from "@/lib/store/usePassToken";
import { faceOf } from "@/lib/engine/verticals";
import { getAttendee, getEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { downloadVCard, personaVCard, vcardFileName } from "@/lib/vcard";
import { cn, formatTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { TierBadge } from "./ExecutiveProfileCard";
import { proFontVars } from "./fonts";

type Mode = "access" | "vcard";

/**
 * Pase corporativo (ROUGE Pro): el QR de acceso con la categoría de la entrada (ASISTENTE, SPEAKER, VIP, PRENSA,
 * SPONSOR) y, con el switch, el QR de la tarjeta personal (vCard 3.0) para que alguien la escanee con la cámara y la
 * guarde en sus contactos. "Guardar contacto (.vcf)" descarga o comparte la misma tarjeta. Email y teléfono van solo
 * si la persona los cargó y los deja incluidos.
 */
export function CorporatePassView({ eventId }: { eventId: UUID }) {
  const { state } = useRouge();
  const [mode, setMode] = useState<Mode>("access");
  const [withEmail, setWithEmail] = useState(true);
  const [withPhone, setWithPhone] = useState(true);
  const me = state.profiles.find((p) => p.id === state.current_user_id);
  const event = getEvent(state, eventId);
  const att = me ? getAttendee(state, eventId, me.id) : undefined;
  const face = me ? faceOf(state, me.id, eventId) : undefined;
  const persona = face?.persona ?? null;
  const tier = att?.tier ?? "attendee";
  const name = persona?.display_name || me?.full_name || "";
  const vcard = useMemo(
    () => (persona ? personaVCard(persona, event?.name ?? null, { email: withEmail, phone: withPhone }) : ""),
    [persona, event?.name, withEmail, withPhone],
  );
  const pass = usePassToken(eventId);
  if (!me || !event) return null;
  const myZones = zonesForTier(state, eventId, tier);
  const restricted = zonesOf(state, eventId).filter((z) => z.kind === "area" && !myZones.some((m) => m.id === z.id));
  const qrValue = mode === "access" ? pass?.value : vcard;

  return (
    <div className={cn(proFontVars, "space-y-4 font-pro text-white")} data-testid="corporate-pass">
      <section className="overflow-hidden rounded-3xl border border-pro-line bg-gradient-to-b from-pro-panel to-pro-slate shadow-2xl">
        <div className="flex items-center justify-between border-b border-pro-line px-5 py-3">
          <span className="font-pro text-sm font-bold tracking-[-0.02em]">
            ROUGE <span className="font-pro-mono text-[10px] text-pro-gold">PRO</span>
          </span>
          <TierBadge tier={tier} className="text-[11px]" />
        </div>
        <div className="flex items-center gap-3 px-5 pt-4">
          <Avatar profile={{ full_name: name, photos: persona?.photos.slice(0, 1) ?? [] }} size={52} className="rounded-xl bg-pro-panel font-pro text-pro-mist ring-1 ring-pro-line" />
          <div className="min-w-0">
            <p className="truncate font-pro text-lg font-semibold leading-tight">{name}</p>
            <p className="truncate text-xs text-pro-mist">{[persona?.job_title, persona?.company].filter(Boolean).join(" · ") || "Completá tu ficha ejecutiva"}</p>
          </div>
        </div>

        {/* Switch QR de Acceso ⇄ QR Tarjeta Personal */}
        <div role="tablist" aria-label="Tipo de QR" className="mx-5 mt-4 grid grid-cols-2 gap-1 rounded-xl border border-pro-line bg-pro-navy p-1">
          {(
            [
              { id: "access", label: "QR de Acceso", icon: <QrCode className="size-4" /> },
              { id: "vcard", label: "Tarjeta (vCard)", icon: <Contact className="size-4" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              onClick={() => setMode(t.id)}
              disabled={t.id === "vcard" && !persona}
              className={cn("flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-40", mode === t.id ? "bg-pro-cobalt text-white shadow" : "text-pro-mist hover:text-white")}
              data-testid={`pass-mode-${t.id}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 px-5 pb-5 pt-5">
          <div className="rounded-2xl bg-white p-4" data-testid="pass-qr" data-pass-value={mode === "access" ? (qrValue ?? "") : undefined}>
            {qrValue ? (
              <QRCodeSVG value={qrValue} size={216} level="M" bgColor="#FFFFFF" fgColor="#0B1120" aria-label={mode === "access" ? "QR de acceso" : "QR de tarjeta personal"} />
            ) : (
              <div className="grid size-[216px] place-items-center text-pro-ink-soft">
                <Loader2 className="size-8 animate-spin" aria-label="Generando tu pase" />
              </div>
            )}
          </div>
          {mode === "access" && pass?.dynamic && (
            <div className="w-full max-w-[248px]" aria-live="off">
              <div className="h-1 overflow-hidden rounded-full bg-pro-line">
                <div className="h-full rounded-full bg-pro-sapphire transition-[width] duration-1000 ease-linear" style={{ width: `${((pass.secondsLeft ?? 0) / PASS_WINDOW_SECONDS) * 100}%` }} />
              </div>
              <p className="mt-1.5 flex items-center justify-center gap-1.5 font-pro-mono text-[11px] text-pro-mist" data-testid="pass-rotating">
                {pass.stale ? (
                  <>
                    <WifiOff className="size-3.5 text-pro-gold" /> Sin señal: el QR puede estar vencido
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" /> Cambia en {pass.secondsLeft}s · capturas no sirven
                  </>
                )}
              </p>
            </div>
          )}
          {mode === "access" ? (
            <p className="text-center text-xs text-pro-mist">
              {att?.checked_in_at ? (
                <span className="inline-flex items-center gap-1 text-pro-emerald">
                  <CheckCircle2 className="size-3.5" /> Acreditado/a a las {formatTime(att.checked_in_at)}
                </span>
              ) : (
                "Mostralo en la acreditación y en cada sala con control. Subí el brillo al máximo."
              )}
            </p>
          ) : (
            <p className="text-center text-xs text-pro-mist">Que lo escaneen con la cámara: se guarda en sus contactos con la nota “Conocido en {event.name}”.</p>
          )}
        </div>
      </section>

      {mode === "access" && (myZones.length > 0 || restricted.length > 0) && (
        <section className="rounded-2xl border border-pro-line bg-pro-slate p-4">
          <h3 className="mb-2 flex items-center gap-1.5 font-pro-mono text-[11px] uppercase tracking-[0.16em] text-pro-mist">
            <DoorOpen className="size-3.5" /> Tus accesos
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {myZones.map((z) => (
              <li key={z.id} className="rounded-lg border border-pro-emerald/40 bg-pro-emerald/10 px-2.5 py-1 text-xs font-semibold text-white">
                ✓ {z.name}
              </li>
            ))}
            {restricted.map((z) => (
              <li key={z.id} className="inline-flex items-center gap-1 rounded-lg border border-pro-line px-2.5 py-1 text-xs text-pro-mist">
                <Lock className="size-3" /> {z.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {persona && (
        <section className="space-y-3 rounded-2xl border border-pro-line bg-pro-slate p-4">
          {(persona.contact_email || persona.contact_phone) && (
            <div className="space-y-2">
              <p className="text-[13px] font-semibold">Qué incluye tu tarjeta</p>
              {persona.contact_email && <Toggle label={`Email · ${persona.contact_email}`} on={withEmail} onChange={setWithEmail} />}
              {persona.contact_phone && <Toggle label="Teléfono de contacto" on={withPhone} onChange={setWithPhone} />}
            </div>
          )}
          {!persona.contact_email && !persona.contact_phone && <p className="text-xs text-pro-mist">Tu tarjeta lleva nombre, cargo, empresa, LinkedIn y sitio. Podés sumar email y teléfono en tu ficha.</p>}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => void downloadVCard(vcard, vcardFileName(name))}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-pro-cobalt text-sm font-semibold text-white transition hover:bg-pro-sapphire"
              data-testid="download-my-vcard"
            >
              <Download className="size-4" /> Guardar contacto (.vcf)
            </button>
            <button
              type="button"
              onClick={() => void downloadVCard(vcard, vcardFileName(name), { preferShare: true })}
              aria-label="Compartir tarjeta"
              className="grid min-h-[48px] w-12 place-items-center rounded-xl border border-pro-line bg-pro-panel text-white transition hover:border-pro-sapphire/60"
            >
              <Share2 className="size-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-pro-line bg-pro-panel/40 px-3 text-left text-sm">
      <span className="min-w-0 truncate text-white/90">{label}</span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition", on ? "bg-pro-sapphire" : "bg-pro-line")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition", on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}
