/**
 * Leads B2B de ROUGE PRO (/pro) — reglas PURAS (validación y mensaje para el equipo comercial).
 * Espejo de los checks de `public.b2b_leads` en schema.sql. Lo usan el formulario (validación en vivo) y
 * POST /api/leads (validación real en el servidor).
 */
import { normalizePhone } from "@/lib/utils";

export const LEAD_EVENT_TYPES = [
  { id: "congress", label: "Congreso o cumbre" },
  { id: "expo", label: "Feria o exposición" },
  { id: "internal", label: "Evento interno / fiesta de fin de año" },
  { id: "cowork", label: "Cowork o comunidad" },
  { id: "launch", label: "Lanzamiento de marca" },
  { id: "other", label: "Otro" },
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number]["id"];

export const LEAD_ATTENDEES_MIN = 10;
export const LEAD_ATTENDEES_MAX = 100_000;
export const LEAD_MESSAGE_MAX = 1000;

export interface LeadInput {
  name: string;
  company: string;
  /** Cargo de quien consulta (opcional). */
  job_title?: string | null;
  email: string;
  whatsapp?: string | null;
  event_type: string;
  attendees: number | string;
  message?: string | null;
  source?: string | null;
  /** Honeypot: un campo oculto que una persona nunca completa. */
  website?: string | null;
}

export interface Lead {
  name: string;
  company: string;
  job_title: string | null;
  email: string;
  whatsapp: string | null;
  event_type: LeadEventType;
  attendees: number;
  message: string;
  source: string;
}

export type LeadField = "name" | "company" | "job_title" | "email" | "whatsapp" | "event_type" | "attendees" | "message";
export type LeadResult = { ok: true; lead: Lead } | { ok: false; errors: Partial<Record<LeadField, string>>; spam?: boolean };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Dominios de correo personal: se aceptan (muchas pymes los usan) pero se marcan para el equipo comercial. */
const FREE_MAIL = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.ar", "live.com", "icloud.com", "hotmail.com.ar"]);

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max + 1) : "");

export function validateLead(input: LeadInput): LeadResult {
  if (input.website && String(input.website).trim()) return { ok: false, errors: {}, spam: true };
  const errors: Partial<Record<LeadField, string>> = {};
  const name = clean(input.name, 80);
  const company = clean(input.company, 120);
  const jobTitle = clean(input.job_title ?? "", 80);
  const email = clean(input.email, 160).toLowerCase();
  const message = typeof input.message === "string" ? input.message.trim().slice(0, LEAD_MESSAGE_MAX + 1) : "";
  const attendees = typeof input.attendees === "number" ? input.attendees : Number(String(input.attendees).replace(/\D/g, ""));

  if (name.length < 2 || name.length > 80) errors.name = "Contanos tu nombre.";
  if (company.length < 2 || company.length > 120) errors.company = "¿Para qué empresa u organización es?";
  if (jobTitle.length > 80) errors.job_title = "Hasta 80 caracteres.";
  if (!EMAIL_RE.test(email) || email.length > 160) errors.email = "Ingresá un email válido.";
  let whatsapp: string | null = null;
  if (input.whatsapp && String(input.whatsapp).trim()) {
    whatsapp = normalizePhone(String(input.whatsapp));
    if (!whatsapp) errors.whatsapp = "Ese número no parece válido (ej. 11 2345-6789).";
  }
  if (!LEAD_EVENT_TYPES.some((t) => t.id === input.event_type)) errors.event_type = "Elegí el tipo de evento.";
  if (!Number.isInteger(attendees) || attendees < LEAD_ATTENDEES_MIN || attendees > LEAD_ATTENDEES_MAX) errors.attendees = `Entre ${LEAD_ATTENDEES_MIN} y ${LEAD_ATTENDEES_MAX.toLocaleString("es-AR")} asistentes.`;
  if (message.length > LEAD_MESSAGE_MAX) errors.message = `Hasta ${LEAD_MESSAGE_MAX} caracteres.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    lead: { name, company, job_title: jobTitle || null, email, whatsapp, event_type: input.event_type as LeadEventType, attendees, message, source: clean(input.source ?? "pro", 60) || "pro" },
  };
}

export const isFreeMail = (email: string) => FREE_MAIL.has(email.split("@")[1] ?? "");

/** Texto del aviso al equipo comercial (formato compatible con webhooks de Slack: { text }). */
export function leadNotification(lead: Lead): string {
  const type = LEAD_EVENT_TYPES.find((t) => t.id === lead.event_type)?.label ?? lead.event_type;
  return [
    `🆕 Lead ROUGE Pro · ${lead.company}`,
    `👤 ${lead.name}${lead.job_title ? ` (${lead.job_title})` : ""} · ${lead.email}${isFreeMail(lead.email) ? " (mail personal)" : ""}`,
    lead.whatsapp ? `📱 ${lead.whatsapp} · https://wa.me/${lead.whatsapp.replace("+", "")}` : null,
    `🎟️ ${type} · ${lead.attendees.toLocaleString("es-AR")} asistentes`,
    lead.message ? `💬 ${lead.message}` : null,
    `Origen: ${lead.source}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Planes B2B (sin precios duros: se cotiza a medida) ────────────────

export type PlanId = "starter" | "pro" | "enterprise";

export const B2B_PLANS: { id: PlanId; name: string; forWho: string; features: string[] }[] = [
  {
    id: "starter",
    name: "Starter Event",
    forWho: "Un evento, hasta 300 asistentes",
    features: ["Acreditación con QR de 1 uso y escáner en la puerta", "Networking por lo que cada uno busca y ofrece", "Reuniones 1 a 1 con pin en el plano", "Agenda, avisos en vivo y Pantalla LED", "CRM de asistentes + CSV"],
  },
  {
    id: "pro",
    name: "Corporate Pro",
    forWho: "Eventos de 300 a 2.000 personas o varios por año",
    features: ["Todo Starter", "Salas y mesas con cupo para la ronda de negocios", "Marca blanca: logo y colores de tu empresa", "Barra y catering sin fila, con cobro o con cupos", "Networking solo para acreditados", "Reporte post-evento"],
  },
  {
    id: "enterprise",
    name: "Enterprise / Multi-evento",
    forWho: "Congresos y expos de +2.000, calendario anual",
    features: ["Todo Corporate Pro", "API para tu sistema de registro o ticketera", "Equipo con roles: producción, seguridad, barra", "Varias marcas y eventos en simultáneo", "Acompañamiento en sitio el día del evento"],
  },
];

/** Plan sugerido según asistentes por evento y eventos por año (orientativo; la cotización es a medida). */
export function recommendPlan(attendees: number, eventsPerYear: number): PlanId {
  if (attendees > 2000 || eventsPerYear >= 6) return "enterprise";
  if (attendees > 300 || eventsPerYear >= 2) return "pro";
  return "starter";
}
