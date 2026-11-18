"use client";

import type { ReactNode } from "react";
import { BadgeCheck, Building2, Contact, Download, Globe, Link2, Lock, Mail, Phone } from "lucide-react";
import type { AttendeeTier, Profile, ProfilePersona } from "@/lib/types";
import { industryLabel, needEmoji, needLabel, tierLabel } from "@/lib/engine/verticals";
import { formatPhone } from "@/lib/engine/profile";
import { downloadVCard, personaVCard, vcardFileName } from "@/lib/vcard";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { proFontVars } from "./fonts";

/** Cara corporativa de una persona (`faceOf` en un evento corporativo): perfil profesional o cara neutra. */
export type ExecutiveFace = Pick<Profile, "id" | "full_name" | "photos" | "is_verified"> & { persona: ProfilePersona | null };

/**
 * Ficha ejecutiva (ROUGE Pro): la cara de una persona en un evento corporativo, con identidad sobria (navy/slate,
 * cobalto, bordes finos, Inter). Sin fotos de fiesta, loop, música, edad ni Instagram: un avatar profesional, nombre,
 * cargo, empresa, rubro, bio profesional, "Qué busco / Qué ofrezco", LinkedIn y sitio. Email y teléfono aparecen solo
 * si quien mira los puede ver (la ficha ya llega saneada por persona_cards / sanitizePersonaFor).
 */
export function ExecutiveProfileCard({
  face,
  tier,
  eventName,
  affinity,
  highlights = [],
  actions,
  self = false,
  className,
}: {
  face: ExecutiveFace;
  tier?: AttendeeTier | null;
  eventName?: string | null;
  /** % de afinidad de negocio (si se calcula). */
  affinity?: number | null;
  /** Etiquetas de lo que se cruza con quien mira ("Software y tecnología"). */
  highlights?: string[];
  actions?: ReactNode;
  /** Es mi propia ficha ("Así te ven"): no ofrece guardar el contacto. */
  self?: boolean;
  className?: string;
}) {
  const p = face.persona;
  const name = p?.display_name || face.full_name;
  const industry = industryLabel(p?.industry);
  const hasContact = !!(p?.contact_email || p?.contact_phone);
  const vip = tier && tier !== "attendee";

  const saveContact = () => {
    if (!p) return;
    void downloadVCard(personaVCard(p, eventName ?? null), vcardFileName(name));
  };

  return (
    <article className={cn(proFontVars, "overflow-hidden rounded-3xl border border-pro-line bg-pro-slate font-pro text-pro-alabaster shadow-2xl", className)} data-testid="executive-card">
      {/* Franja superior: submarca, categoría y afinidad */}
      <div className="flex items-center justify-between gap-2 border-b border-pro-line bg-pro-navy/70 px-5 py-3">
        <span className="font-pro-mono text-[10px] uppercase tracking-[0.2em] text-pro-mist">
          ROUGE <span className="text-pro-gold">PRO</span> · Ficha ejecutiva
        </span>
        <span className="flex items-center gap-1.5">
          {vip && <TierBadge tier={tier} />}
          {affinity != null && affinity > 0 && (
            <span className="rounded-full border border-pro-sapphire/50 bg-pro-sapphire/15 px-2 py-0.5 font-pro-mono text-[10px] font-semibold text-white">{affinity}% afinidad</span>
          )}
        </span>
      </div>

      <div className="space-y-5 p-5">
        <header className="flex items-start gap-4">
          <Avatar profile={{ full_name: name, photos: p?.photos.slice(0, 1) ?? [] }} size={84} className="rounded-2xl bg-pro-panel font-pro text-pro-mist ring-1 ring-pro-line" />
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="flex items-center gap-1.5 font-pro text-[22px] font-bold leading-tight tracking-[-0.02em]">
              <span className="min-w-0 break-words">{name}</span>
              {face.is_verified && <BadgeCheck className="size-5 shrink-0 text-pro-sapphire" aria-label="Verificado" />}
            </h2>
            {p?.job_title && <p className="mt-1 text-[15px] font-medium text-white/90">{p.job_title}</p>}
            {(p?.company || industry) && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-pro-mist">
                <Building2 className="size-3.5 shrink-0" /> {[p?.company, industry].filter(Boolean).join(" · ")}
              </p>
            )}
            {!p && <p className="mt-1 text-sm text-pro-mist">Sin ficha profesional en este evento.</p>}
          </div>
        </header>

        {p?.bio && <p className="text-[15px] leading-relaxed text-white/85">{p.bio}</p>}

        {p && (p.looking_for.length > 0 || p.looking_for_note) && (
          <NeedBlock title="Qué busco" tone="gold" needs={p.looking_for} note={p.looking_for_note} highlights={highlights} />
        )}
        {p && (p.offering.length > 0 || p.offering_note) && <NeedBlock title="Qué ofrezco" tone="sapphire" needs={p.offering} note={p.offering_note} highlights={highlights} />}

        {p && (p.linkedin_url || p.website_url || hasContact) && (
          <ul className="divide-y divide-pro-line overflow-hidden rounded-2xl border border-pro-line">
            {p.linkedin_url && <LinkRow href={p.linkedin_url} icon={<Link2 className="size-4" />} label="LinkedIn" value={p.linkedin_url.replace("https://www.", "")} />}
            {p.website_url && <LinkRow href={p.website_url} icon={<Globe className="size-4" />} label="Sitio web" value={p.website_url.replace("https://", "")} />}
            {p.contact_email && <LinkRow href={`mailto:${p.contact_email}`} icon={<Mail className="size-4" />} label="Email" value={p.contact_email} />}
            {p.contact_phone && <LinkRow href={`tel:${p.contact_phone}`} icon={<Phone className="size-4" />} label="Teléfono" value={formatPhone(p.contact_phone)} />}
          </ul>
        )}
        {p && !self && !hasContact && (
          <p className="flex items-start gap-2 rounded-2xl border border-dashed border-pro-line px-4 py-3 text-xs text-pro-mist">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> Email y teléfono se comparten al aceptar una reunión o un contacto, según la privacidad de cada persona.
          </p>
        )}

        {actions}

        {p && !self && (
          <button
            type="button"
            onClick={saveContact}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-pro-line bg-pro-panel font-pro text-sm font-semibold text-white transition hover:border-pro-sapphire/60"
            data-testid="save-vcard"
          >
            <Download className="size-4" /> Guardar contacto (.vcf)
          </button>
        )}
      </div>
    </article>
  );
}

export function TierBadge({ tier, className }: { tier: AttendeeTier | null | undefined; className?: string }) {
  const t = tier ?? "attendee";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-pro-mono text-[10px] font-semibold tracking-wider",
        t === "attendee" ? "border-pro-line bg-pro-panel text-pro-mist" : t === "vip" || t === "sponsor" ? "border-pro-gold/50 bg-pro-gold/15 text-pro-gold" : "border-pro-sapphire/50 bg-pro-sapphire/15 text-white",
        className,
      )}
      data-testid="tier-badge"
    >
      {tierLabel(t)}
    </span>
  );
}

function NeedBlock({ title, tone, needs, note, highlights }: { title: string; tone: "gold" | "sapphire"; needs: ProfilePersona["looking_for"]; note: string; highlights: string[] }) {
  return (
    <section>
      <h3 className="mb-2 font-pro-mono text-[11px] uppercase tracking-[0.16em] text-pro-mist">{title}</h3>
      {needs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {needs.map((n) => {
            const on = highlights.includes(needLabel(n));
            return (
              <li
                key={n}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-semibold",
                  on ? (tone === "gold" ? "border-pro-gold bg-pro-gold/20 text-white" : "border-pro-sapphire bg-pro-sapphire/25 text-white") : "border-pro-line bg-pro-panel/60 text-white/85",
                )}
              >
                <span aria-hidden>{needEmoji(n)}</span> {needLabel(n)}
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="mt-2 text-sm text-white/80">{note}</p>}
    </section>
  );
}

function LinkRow({ href, icon, label, value }: { href: string; icon: ReactNode; label: string; value: string }) {
  const external = href.startsWith("http");
  return (
    <li>
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined} className="flex min-h-[48px] items-center gap-3 bg-pro-panel/40 px-4 py-2 transition hover:bg-pro-panel">
        <span className="text-pro-sapphire">{icon}</span>
        <span className="w-20 shrink-0 font-pro-mono text-[11px] uppercase tracking-wider text-pro-mist">{label}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-white">{value}</span>
      </a>
    </li>
  );
}

/** Ícono para "Tarjeta personal" (reexport para el pase). */
export const VCardIcon = Contact;
