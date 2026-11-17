/**
 * Campañas por WhatsApp SIN la API paga — reglas PURAS.
 *
 * El organizador elige un segmento de su base de clientes (cumpleañeros de la semana, VIP de alto consumo, inactivos
 * > 30 días o invitados por RRPP), arma una plantilla con variables ({nombre}, {evento}, {beneficio}, {link_qr}) y
 * obtiene una bandeja de envío: cada fila abre wa.me/<teléfono>?text=<mensaje personalizado> en WhatsApp Web o en el
 * celular, y queda marcada como "Contactado". Nada se manda solo: lo envía una persona desde su WhatsApp.
 * Contraparte SQL: org_contacts (RPC, solo dueño/a y producción), campaigns, campaign_contacts.
 */
import type { Campaign, CampaignContact, CampaignSegment, OrgContact, RougeState, UUID } from "@/lib/types";
import { uid, whatsappLink } from "@/lib/utils";
import { can, organizationOf } from "./roles";
import { crmRows } from "./analytics";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const SEGMENTS: { id: CampaignSegment; label: string; emoji: string; hint: string }[] = [
  { id: "birthdays_week", label: "Cumpleañeros de la semana", emoji: "🎂", hint: "Cumplen años en los próximos 7 días." },
  { id: "vip_spenders", label: "VIP de alto consumo", emoji: "💎", hint: "Top 20 % de consumo en barra (mínimo $50.000)." },
  { id: "inactive_30d", label: "Inactivos > 30 días", emoji: "😴", hint: "Vinieron antes pero no en el último mes." },
  { id: "rrpp_guests", label: "Invitados por RRPP", emoji: "📣", hint: "Entraron por el link de un RRPP." },
  { id: "all", label: "Toda la base", emoji: "👥", hint: "Todos los que tienen teléfono." },
];

export const TEMPLATE_VARS = ["{nombre}", "{evento}", "{beneficio}", "{link_qr}"] as const;
export const DEFAULT_TEMPLATE = "¡Hola {nombre}! 🎉 Este finde es {evento}. Te guardamos {beneficio}: entrá con tu link y mostrá el QR 👉 {link_qr}";
export const VIP_MIN_SPENT = 50_000;
export const TEMPLATE_MAX = 600;

const DAY = 86_400_000;

/** ¿Cumple años en los próximos 7 días (incluye hoy)? Maneja el cambio de año. */
export function birthdayThisWeek(birth: string, now = Date.now()): boolean {
  const [, mm, dd] = birth.split("-").map(Number);
  const today = new Date(now);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * DAY);
    if (d.getMonth() + 1 === mm && d.getDate() === dd) return true;
  }
  return false;
}

/** Base de clientes: la del servidor (org_contacts) o, en el demo, la que surge del CRM del evento. */
export function contactsOf(s: RougeState, eventId: UUID): OrgContact[] {
  if (s.org_contacts?.length) return s.org_contacts;
  const ev = s.events.find((e) => e.id === eventId);
  return crmRows(s, eventId).map((r) => {
    const att = s.event_attendees.find((a) => a.event_id === eventId && a.user_id === r.user_id);
    const p = s.profiles.find((x) => x.id === r.user_id);
    return { user_id: r.user_id, full_name: r.full_name, phone: r.phone ?? null, birth_date: p?.birth_date ?? "2000-01-01", total_spent: r.total_spent, events_count: 1, last_event_at: ev?.starts_at ?? att?.joined_at ?? new Date().toISOString(), referred_by: att?.referred_by ?? null };
  });
}

export function segmentAudience(contacts: OrgContact[], segment: CampaignSegment, now = Date.now(), promoterId: UUID | null = null): OrgContact[] {
  const withPhone = contacts.filter((c) => !!c.phone);
  switch (segment) {
    case "birthdays_week":
      return withPhone.filter((c) => birthdayThisWeek(c.birth_date, now));
    case "vip_spenders": {
      const sorted = [...withPhone].sort((a, b) => b.total_spent - a.total_spent);
      const top = Math.max(1, Math.ceil(sorted.length * 0.2));
      return sorted.slice(0, top).filter((c) => c.total_spent >= VIP_MIN_SPENT);
    }
    case "inactive_30d":
      return withPhone.filter((c) => now - +new Date(c.last_event_at) > 30 * DAY);
    case "rrpp_guests":
      return withPhone.filter((c) => (promoterId ? c.referred_by === promoterId : !!c.referred_by));
    default:
      return withPhone;
  }
}

/** Reemplaza las variables de la plantilla (solo el primer nombre, más cercano). */
export function renderTemplate(template: string, vars: { nombre: string; evento: string; beneficio: string; link_qr: string }): string {
  return template.replace(/\{(nombre|evento|beneficio|link_qr)\}/g, (_, k: keyof typeof vars) => (k === "nombre" ? vars.nombre.split(" ")[0] : vars[k]));
}

export function createCampaign(s: RougeState, eventId: UUID, input: { name: string; segment: CampaignSegment; template: string; benefit: string; promoter_id?: UUID | null }, now = Date.now()): R<Campaign> {
  if (!can(s, eventId, s.current_user_id, "admin.crm")) return fail("Tu rol no tiene permiso para esto.");
  const org = organizationOf(s, eventId);
  if (!org) return fail("El evento no existe.");
  const name = input.name.trim();
  if (!name || name.length > 60) return fail("Poné un nombre a la campaña (máximo 60).");
  if (!SEGMENTS.some((x) => x.id === input.segment)) return fail("Elegí un segmento.");
  const template = input.template.trim();
  if (!template || template.length > TEMPLATE_MAX) return fail(`El mensaje va de 1 a ${TEMPLATE_MAX} caracteres.`);
  if (!template.includes("{nombre}")) return fail("Incluí {nombre}: los mensajes personalizados no se marcan como spam.");
  const c: Campaign = { id: uid(), organization_id: org, event_id: eventId, name, segment: input.segment, promoter_id: input.promoter_id ?? null, template, benefit: input.benefit.trim().slice(0, 80), created_by: s.current_user_id, created_at: new Date(now).toISOString() };
  return { ok: true, state: { ...s, campaigns: [...(s.campaigns ?? []), c] }, data: c };
}

/** Marca (o desmarca) a alguien como contactado en una campaña. */
export function markContacted(s: RougeState, campaignId: UUID, userId: UUID, contacted: boolean, now = Date.now()): R<CampaignContact | null> {
  const c = (s.campaigns ?? []).find((x) => x.id === campaignId);
  if (!c || !c.event_id || !can(s, c.event_id, s.current_user_id, "admin.crm")) return fail("Tu rol no tiene permiso para esto.");
  const rest = (s.campaign_contacts ?? []).filter((x) => !(x.campaign_id === campaignId && x.user_id === userId));
  if (!contacted) return { ok: true, state: { ...s, campaign_contacts: rest }, data: null };
  const row: CampaignContact = { campaign_id: campaignId, user_id: userId, contacted_at: new Date(now).toISOString(), contacted_by: s.current_user_id };
  return { ok: true, state: { ...s, campaign_contacts: [...rest, row] }, data: row };
}

export interface OutboxRow {
  contact: OrgContact;
  message: string;
  href: string;
  contacted_at: string | null;
}

/** Bandeja de envío: un mensaje personalizado y su link wa.me por persona del segmento. */
export function campaignOutbox(s: RougeState, campaign: Campaign, eventName: string, linkFor: (c: OrgContact) => string, now = Date.now()): OutboxRow[] {
  const done = new Map((s.campaign_contacts ?? []).filter((x) => x.campaign_id === campaign.id).map((x) => [x.user_id, x.contacted_at]));
  return segmentAudience(contactsOf(s, campaign.event_id ?? s.active_event_id), campaign.segment, now, campaign.promoter_id).map((contact) => {
    const message = renderTemplate(campaign.template, { nombre: contact.full_name, evento: eventName, beneficio: campaign.benefit || "un beneficio especial", link_qr: linkFor(contact) });
    return { contact, message, href: whatsappLink(contact.phone!, message), contacted_at: done.get(contact.user_id) ?? null };
  });
}
