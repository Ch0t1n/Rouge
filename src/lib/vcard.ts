/**
 * Tarjeta personal digital (vCard 3.0, RFC 2426) — pura, sin DOM salvo `downloadVCard`.
 *
 * Se arma en el cliente con los datos que quien mira PUEDE ver (la ficha saneada por `persona_cards` /
 * `sanitizePersonaFor`): email y teléfono solo si su dueño/a los habilitó y su nivel de privacidad lo permite.
 * Nota automática: "NETWORKING: Conocido en <evento>".
 */
import type { ProfilePersona } from "@/lib/types";

export interface VCardInput {
  fullName: string;
  jobTitle?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  /** Nombre del evento para la nota automática. */
  eventName?: string | null;
  /** Rubro u otra línea extra para la nota. */
  extraNote?: string | null;
}

/** Escapa un valor de texto: barra invertida, coma, punto y coma y saltos de línea (RFC 2426 §4). */
export const escapeVCard = (v: string) => v.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** Pliega líneas de más de 75 octetos (CRLF + espacio) sin partir caracteres UTF-8. */
export function foldLine(line: string): string {
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // las continuaciones llevan un espacio adelante
    if (bytes(cur + ch) > limit) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** "Valeria Ortiz" → N:Ortiz;Valeria;;; (el último término como apellido). */
function structuredName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return `${escapeVCard(parts[0] ?? "")};;;;`;
  const family = parts.pop()!;
  return `${escapeVCard(family)};${escapeVCard(parts.join(" "))};;;`;
}

export const vcardNote = (eventName?: string | null) => (eventName ? `NETWORKING: Conocido en ${eventName}` : "NETWORKING: Conocido en ROUGE Pro");

/** Genera una vCard 3.0 válida (líneas CRLF, plegadas a 75 octetos). */
export function buildVCard(input: VCardInput): string {
  const name = input.fullName.trim() || "Contacto";
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${structuredName(name)}`, `FN:${escapeVCard(name)}`];
  if (input.company?.trim()) lines.push(`ORG:${escapeVCard(input.company.trim())}`);
  if (input.jobTitle?.trim()) lines.push(`TITLE:${escapeVCard(input.jobTitle.trim())}`);
  if (input.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVCard(input.email.trim())}`);
  if (input.phone?.trim()) lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCard(input.phone.trim())}`);
  if (input.websiteUrl?.trim()) lines.push(`URL;TYPE=WORK:${input.websiteUrl.trim()}`);
  if (input.linkedinUrl?.trim()) {
    lines.push(`URL;TYPE=LinkedIn:${input.linkedinUrl.trim()}`);
    lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${input.linkedinUrl.trim()}`);
  }
  const note = [vcardNote(input.eventName), input.extraNote?.trim()].filter(Boolean).join("\n");
  lines.push(`NOTE:${escapeVCard(note)}`);
  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** vCard de un perfil profesional tal como lo ve quien la guarda (ficha ya saneada). */
export function personaVCard(p: Pick<ProfilePersona, "display_name" | "job_title" | "company" | "contact_email" | "contact_phone" | "linkedin_url" | "website_url">, eventName: string | null, opts: { email?: boolean; phone?: boolean } = {}) {
  return buildVCard({
    fullName: p.display_name,
    jobTitle: p.job_title,
    company: p.company,
    email: opts.email === false ? null : p.contact_email,
    phone: opts.phone === false ? null : p.contact_phone,
    linkedinUrl: p.linkedin_url,
    websiteUrl: p.website_url,
    eventName,
  });
}

/** "Valeria Ortiz" → "valeria-ortiz.vcf" */
export const vcardFileName = (name: string) =>
  `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contacto"}.vcf`;

/**
 * Descarga (o comparte) el .vcf. En el celular usa la hoja de compartir nativa con el archivo si está disponible
 * (iOS/Android lo abren con Contactos); si no, descarga con un link (escritorio y navegadores sin Web Share).
 */
export async function downloadVCard(vcard: string, fileName: string, opts: { preferShare?: boolean } = {}): Promise<"shared" | "downloaded"> {
  const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
  if (opts.preferShare && typeof navigator !== "undefined" && "canShare" in navigator) {
    try {
      const file = new File([blob], fileName, { type: "text/vcard" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName.replace(/\.vcf$/, "") });
        return "shared";
      }
    } catch (e) {
      // Si la persona cerró la hoja de compartir, no forzamos la descarga.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
