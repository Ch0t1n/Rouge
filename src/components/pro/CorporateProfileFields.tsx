"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { BUSINESS_NEEDS, INDUSTRIES, PERSONA_PRIVACY_LEVELS, type BusinessNeed, type Industry, type PersonaPrivacyLevel, type ProfilePersona, type ProfilePhoto } from "@/lib/types";
import type { PersonaInput } from "@/lib/engine/actions";
import {
  COMPANY_MAX,
  JOB_TITLE_MAX,
  NEED_NOTE_MAX,
  NEEDS_MAX,
  OFFERABLE_NEEDS,
  PRO_BIO_MAX,
  parseContactEmail,
  parseLinkedin,
  parseWebsite,
} from "@/lib/engine/verticals";
import { averageColor, compressImage, imageSize } from "@/lib/media/compress";
import { uploadMedia } from "@/lib/media/upload";
import { useRouge } from "@/lib/store/RougeContext";
import { normalizePhone } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/media/MediaImage";

/** Borrador editable de la ficha ejecutiva (perfil profesional `corporate`). */
export interface CorporateDraft {
  label: string;
  display_name: string;
  photos: ProfilePhoto[];
  job_title: string;
  company: string;
  industry: Industry | null;
  bio: string;
  looking_for: BusinessNeed[];
  looking_for_note: string;
  offering: BusinessNeed[];
  offering_note: string;
  linkedin_url: string;
  website_url: string;
  contact_email: string;
  contact_phone: string;
  privacy_level: PersonaPrivacyLevel;
}

export const draftFrom = (p: ProfilePersona | null | undefined, fallbackName: string): CorporateDraft => ({
  label: p?.label ?? "Trabajo",
  display_name: p?.display_name ?? fallbackName,
  photos: p?.photos.slice(0, 1) ?? [],
  job_title: p?.job_title ?? "",
  company: p?.company ?? "",
  industry: p?.industry ?? null,
  bio: p?.bio ?? "",
  looking_for: p?.looking_for ?? [],
  looking_for_note: p?.looking_for_note ?? "",
  offering: p?.offering ?? [],
  offering_note: p?.offering_note ?? "",
  linkedin_url: p?.linkedin_url ?? "",
  website_url: p?.website_url ?? "",
  contact_email: p?.contact_email ?? "",
  contact_phone: p?.contact_phone ?? "",
  privacy_level: p?.privacy_level ?? "strict",
});

export const draftToInput = (d: CorporateDraft, id?: string): PersonaInput => ({
  id,
  kind: "corporate",
  label: d.label,
  display_name: d.display_name,
  photos: d.photos,
  bio: d.bio,
  job_title: d.job_title,
  company: d.company,
  industry: d.industry,
  looking_for: d.looking_for,
  looking_for_note: d.looking_for_note,
  offering: d.offering,
  offering_note: d.offering_note,
  linkedin_url: d.linkedin_url.trim() || null,
  website_url: d.website_url.trim() || null,
  contact_email: d.contact_email.trim() || null,
  contact_phone: d.contact_phone.trim() || null,
  privacy_level: d.privacy_level,
});

/** Errores por campo (mismas reglas que upsertPersona, para avisar antes de guardar). */
export function draftErrors(d: CorporateDraft) {
  const e: Partial<Record<keyof CorporateDraft | "work" | "needs", string>> = {};
  if (!d.display_name.trim()) e.display_name = "Ingresá tu nombre.";
  if (!d.job_title.trim() && !d.company.trim()) e.work = "Contá tu cargo o tu empresa.";
  if (!d.looking_for.length && !d.offering.length) e.needs = "Elegí algo que buscás u ofrecés.";
  if (d.bio.length > PRO_BIO_MAX) e.bio = `Máximo ${PRO_BIO_MAX} caracteres.`;
  if (d.linkedin_url.trim() && !parseLinkedin(d.linkedin_url)) e.linkedin_url = "Pegá el link de tu perfil (linkedin.com/in/…).";
  if (d.website_url.trim() && !parseWebsite(d.website_url)) e.website_url = "Ej. tuempresa.com";
  if (d.contact_email.trim() && !parseContactEmail(d.contact_email)) e.contact_email = "Revisá el email.";
  if (d.contact_phone.trim() && !normalizePhone(d.contact_phone)) e.contact_phone = "Revisá el teléfono.";
  return e;
}

/**
 * Campos de la ficha ejecutiva con estética ROUGE Pro. Controlado: `value` + `onChange`.
 * `compact` muestra lo esencial (panel rápido del primer ingreso); el resto queda plegado en "Más datos".
 */
export function CorporateProfileFields({ value: d, onChange, compact = false, showLabel = false }: { value: CorporateDraft; onChange: (d: CorporateDraft) => void; compact?: boolean; showLabel?: boolean }) {
  // Los avisos de "falta…" aparecen recién cuando la persona empieza a completar (no al abrir el panel).
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof CorporateDraft>(k: K, v: CorporateDraft[K]) => {
    setTouched(true);
    onChange({ ...d, [k]: v });
  };
  const all = draftErrors(d);
  const err = touched ? all : { ...all, work: undefined, needs: undefined, display_name: undefined };
  const [more, setMore] = useState(!compact);
  const toggle = (k: "looking_for" | "offering", n: BusinessNeed) => {
    const list = d[k];
    set(k, list.includes(n) ? list.filter((x) => x !== n) : list.length >= NEEDS_MAX ? list : [...list, n]);
  };

  return (
    <div className="space-y-6 font-pro">
      <div className="flex items-start gap-4">
        <ProAvatarField photos={d.photos} onChange={(p) => set("photos", p)} name={d.display_name} />
        <div className="min-w-0 flex-1 space-y-3">
          <ProInput label="Nombre y apellido" value={d.display_name} maxLength={60} onChange={(v) => set("display_name", v)} error={err.display_name} autoComplete="name" />
          {showLabel && <ProInput label="Nombre del perfil (solo vos)" value={d.label} maxLength={30} onChange={(v) => set("label", v)} placeholder="Trabajo, Mi pyme…" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProInput label="Cargo" value={d.job_title} maxLength={JOB_TITLE_MAX} onChange={(v) => set("job_title", v)} placeholder="Directora comercial" autoComplete="organization-title" />
        <ProInput label="Empresa" value={d.company} maxLength={COMPANY_MAX} onChange={(v) => set("company", v)} placeholder="Grupo Meridia" autoComplete="organization" />
      </div>
      {err.work && <p className="-mt-3 text-xs text-red-400">{err.work}</p>}

      <ProField label="Rubro">
        <select value={d.industry ?? ""} onChange={(e) => set("industry", (e.target.value || null) as Industry | null)} className={inputCls(false)}>
          <option value="">Elegí tu rubro</option>
          {INDUSTRIES.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </ProField>

      <ProField label="Bio profesional" counter={`${d.bio.length}/${PRO_BIO_MAX}`} error={err.bio}>
        <textarea value={d.bio} maxLength={PRO_BIO_MAX} rows={3} onChange={(e) => set("bio", e.target.value)} placeholder="Qué hace tu empresa y con quién te gustaría hablar hoy." className={cn(inputCls(!!err.bio), "min-h-[92px] resize-none py-3")} />
      </ProField>

      <NeedPicker title={`Qué busco · ${d.looking_for.length}/${NEEDS_MAX}`} options={BUSINESS_NEEDS} selected={d.looking_for} onToggle={(n) => toggle("looking_for", n)} tone="gold" />
      <ProInput label="Detalle de lo que buscás (opcional)" value={d.looking_for_note} maxLength={NEED_NOTE_MAX} onChange={(v) => set("looking_for_note", v)} placeholder="Proveedores IT, inversores, talento" />
      <NeedPicker title={`Qué ofrezco · ${d.offering.length}/${NEEDS_MAX}`} options={OFFERABLE_NEEDS} selected={d.offering} onToggle={(n) => toggle("offering", n)} tone="sapphire" />
      <ProInput label="Detalle de lo que ofrecés (opcional)" value={d.offering_note} maxLength={NEED_NOTE_MAX} onChange={(v) => set("offering_note", v)} placeholder="Soluciones de automatización y cloud" />
      {err.needs && <p className="-mt-3 text-xs text-red-400">{err.needs}</p>}

      {!more ? (
        <button type="button" onClick={() => setMore(true)} className="min-h-[44px] w-full rounded-xl border border-dashed border-pro-line text-sm font-semibold text-pro-mist hover:text-white">
          + LinkedIn, sitio web y datos de contacto
        </button>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProInput label="LinkedIn (opcional)" value={d.linkedin_url} onChange={(v) => set("linkedin_url", v)} placeholder="linkedin.com/in/tu-nombre" error={err.linkedin_url} autoCapitalize="none" spellCheck={false} />
            <ProInput label="Sitio web (opcional)" value={d.website_url} onChange={(v) => set("website_url", v)} placeholder="tuempresa.com" error={err.website_url} autoCapitalize="none" spellCheck={false} inputMode="url" />
          </div>
          <fieldset className="space-y-3 rounded-2xl border border-pro-line p-4">
            <legend className="px-1 font-pro-mono text-[11px] uppercase tracking-[0.16em] text-pro-mist">Contacto para tu tarjeta (opcional)</legend>
            <p className="text-xs text-pro-mist">No es el teléfono de tu cuenta (ese nunca se muestra). Dejalo vacío si no querés compartir.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProInput label="Email de contacto" type="email" inputMode="email" autoComplete="email" value={d.contact_email} onChange={(v) => set("contact_email", v)} error={err.contact_email} />
              <ProInput label="Teléfono de contacto" type="tel" inputMode="tel" autoComplete="tel" value={d.contact_phone} onChange={(v) => set("contact_phone", v)} placeholder="11 2345-6789" error={err.contact_phone} />
            </div>
            <div role="radiogroup" aria-label="Quién ve tu email y teléfono" className="space-y-2">
              <p className="text-[13px] font-semibold text-white">¿Quién ve tu email y teléfono?</p>
              {PERSONA_PRIVACY_LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={d.privacy_level === l.id}
                  onClick={() => set("privacy_level", l.id)}
                  className={cn("flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition", d.privacy_level === l.id ? "border-pro-sapphire bg-pro-sapphire/15" : "border-pro-line bg-pro-panel/40 hover:border-pro-mist/40")}
                >
                  <span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border", d.privacy_level === l.id ? "border-pro-sapphire" : "border-pro-mist/60")}>
                    {d.privacy_level === l.id && <span className="size-2 rounded-full bg-pro-sapphire" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      {l.label}
                      {l.id === "strict" && <span className="ml-1.5 font-pro-mono text-[10px] uppercase tracking-wider text-pro-emerald">Recomendado</span>}
                    </span>
                    <span className="block text-xs text-pro-mist">{l.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}

/** Errores sin la parte de "más datos" no cuentan como bloqueo si están vacíos: true si se puede guardar. */
export const draftValid = (d: CorporateDraft) => Object.keys(draftErrors(d)).length === 0;

// ── Piezas con estética ROUGE Pro ───────────────────────────────────

const inputCls = (bad: boolean) =>
  cn(
    "min-h-[48px] w-full rounded-xl border bg-pro-navy px-3.5 text-[15px] text-white placeholder:text-pro-mist/60 transition focus:outline-none focus:ring-2",
    bad ? "border-red-500/70 focus:ring-red-500/30" : "border-pro-line focus:border-pro-sapphire focus:ring-pro-sapphire/25",
  );

function ProField({ label, counter, error, children, htmlFor }: { label: string; counter?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block space-y-1.5" htmlFor={htmlFor}>
      <span className="flex items-baseline justify-between text-[13px] font-semibold text-white">
        {label}
        {counter && <span className="font-pro-mono text-[11px] font-normal text-pro-mist">{counter}</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-red-400">{error}</span>}
    </label>
  );
}

function ProInput({
  label,
  value,
  onChange,
  error,
  maxLength,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void; error?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = useId();
  return (
    <ProField label={label} error={error} htmlFor={id} counter={maxLength && value.length > maxLength * 0.8 ? `${value.length}/${maxLength}` : undefined}>
      <input id={id} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className={inputCls(!!error)} {...rest} />
    </ProField>
  );
}

function NeedPicker({ title, options, selected, onToggle, tone }: { title: string; options: readonly { id: BusinessNeed; label: string; emoji: string }[]; selected: BusinessNeed[]; onToggle: (n: BusinessNeed) => void; tone: "gold" | "sapphire" }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-white">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((n) => {
          const on = selected.includes(n.id);
          return (
            <button
              key={n.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(n.id)}
              className={cn(
                "min-h-[40px] rounded-lg border px-3 text-sm font-semibold transition",
                on ? (tone === "gold" ? "border-pro-gold bg-pro-gold/20 text-white" : "border-pro-sapphire bg-pro-sapphire/25 text-white") : "border-pro-line bg-pro-panel/40 text-white/80 hover:border-pro-mist/40",
              )}
            >
              <span aria-hidden>{n.emoji}</span> {n.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Un único avatar profesional: se comprime a WebP antes de subir (baja señal). */
function ProAvatarField({ photos, onChange, name }: { photos: ProfilePhoto[]; onChange: (p: ProfilePhoto[]) => void; name: string }) {
  const { notify } = useRouge();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photo = photos[0];
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file, "profile");
      const [blur_color, size, url] = await Promise.all([averageColor(compressed), imageSize(compressed), uploadMedia(compressed, "photo")]);
      onChange([{ url, blur_color, ...size }]);
    } catch {
      notify({ tone: "error", title: "No pudimos procesar esa foto", description: "Probá con JPG o PNG." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="w-24 shrink-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="relative grid aspect-square w-24 place-items-center overflow-hidden rounded-2xl border border-dashed border-pro-line bg-pro-navy text-pro-mist transition hover:border-pro-sapphire/60"
        aria-label={photo ? "Cambiar foto profesional" : "Agregar foto profesional"}
      >
        {photo ? <MediaImage photo={photo} alt={name} className="absolute inset-0" /> : busy ? null : <ImagePlus className="size-6" />}
        {busy && <Loader2 className="absolute size-6 animate-spin text-white" />}
      </button>
      {photo ? (
        <button type="button" onClick={() => onChange([])} className="mt-1.5 flex min-h-[32px] w-full items-center justify-center gap-1 text-xs text-pro-mist hover:text-white">
          <Trash2 className="size-3.5" /> Quitar
        </button>
      ) : (
        <p className="mt-1.5 text-center text-[11px] leading-tight text-pro-mist">Foto profesional</p>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} data-testid="pro-photo-input" />
    </div>
  );
}
