/**
 * ROUGE — Tipos de dominio.
 * Espejo 1:1 de `supabase/schema.sql`. Si cambiás una tabla, cambiá este archivo.
 * Convención: snake_case en los campos para que las filas de Supabase
 * se puedan usar directamente sin mapeo.
 */

export type UUID = string;
export type ISODate = string;

// ── Catálogos ─────────────────────────────────────────────────────────

export const MUSIC_GENRES = [
  "Techno",
  "House",
  "Reggaetón",
  "Cachengue",
  "Pop",
  "RKT",
  "Indie",
  "Urbano",
  "Electrónica",
] as const;
export type MusicGenre = (typeof MUSIC_GENRES)[number];

/**
 * Verticales de ROUGE (columna `events.kind`, enum `event_kind_t`):
 *  - "nightlife": fiestas y boliches (ROUGE).
 *  - "corporate": eventos de empresas, pymes y networking (ROUGE Pro).
 * Lo que cambia por vertical (moods, campos del perfil, vocabulario, funciones) vive en `engine/verticals.ts`.
 */
export const EVENT_KINDS = ["nightlife", "corporate"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Mood de la noche / "¿a qué venís?": cada uno pertenece a UNA vertical (espejo de `mood_kind()` en SQL). */
export const MOOD_TAGS = [
  { id: "with_friends", label: "Voy con amigos", emoji: "👯", kind: "nightlife" },
  { id: "lost_group", label: "Perdí a mi grupo", emoji: "🧭", kind: "nightlife" },
  { id: "at_bar", label: "En la barra", emoji: "🍸", kind: "nightlife" },
  { id: "open_to_meet", label: "Abierto a conocer gente", emoji: "✨", kind: "nightlife" },
  { id: "just_dance", label: "Solo vengo a bailar", emoji: "💃", kind: "nightlife" },
  { id: "after_hunt", label: "Buscando after", emoji: "🌅", kind: "nightlife" },
  { id: "pro_networking", label: "Haciendo networking", emoji: "🤝", kind: "corporate" },
  { id: "pro_selling", label: "Busco clientes", emoji: "💼", kind: "corporate" },
  { id: "pro_buying", label: "Busco proveedores", emoji: "🛒", kind: "corporate" },
  { id: "pro_partners", label: "Busco socios o alianzas", emoji: "🧩", kind: "corporate" },
  { id: "pro_funding", label: "Busco inversión", emoji: "🚀", kind: "corporate" },
  { id: "pro_hiring", label: "Estoy contratando", emoji: "🧑‍💼", kind: "corporate" },
  { id: "pro_learning", label: "Vengo a aprender", emoji: "📚", kind: "corporate" },
  { id: "pro_coffee", label: "En el coffee break", emoji: "☕", kind: "corporate" },
] as const;
export type MoodTag = (typeof MOOD_TAGS)[number]["id"];

/** Rubro de una persona en eventos corporativos (perfil profesional). */
export const INDUSTRIES = [
  { id: "retail", label: "Comercio" },
  { id: "manufacturing", label: "Industria" },
  { id: "services", label: "Servicios profesionales" },
  { id: "tech", label: "Tecnología" },
  { id: "food", label: "Gastronomía y alimentos" },
  { id: "agro", label: "Agro" },
  { id: "construction", label: "Construcción" },
  { id: "health", label: "Salud" },
  { id: "education", label: "Educación" },
  { id: "tourism", label: "Turismo" },
  { id: "fashion", label: "Moda y textil" },
  { id: "logistics", label: "Logística y transporte" },
  { id: "finance", label: "Finanzas y seguros" },
  { id: "other", label: "Otro rubro" },
] as const;
export type Industry = (typeof INDUSTRIES)[number]["id"];

/**
 * Lo que una persona BUSCA u OFRECE en un evento corporativo. El mismo catálogo para las dos listas:
 * la afinidad de negocio cruza lo que uno busca con lo que el otro ofrece (complementariedad).
 */
export const BUSINESS_NEEDS = [
  { id: "clients", label: "Clientes", emoji: "💼" },
  { id: "suppliers", label: "Proveedores e insumos", emoji: "📦" },
  { id: "partners", label: "Socios y alianzas", emoji: "🧩" },
  { id: "investment", label: "Inversión", emoji: "🚀" },
  { id: "financing", label: "Financiamiento y crédito", emoji: "🏦" },
  { id: "talent", label: "Talento y empleo", emoji: "🧑‍💼" },
  { id: "mentoring", label: "Mentoría", emoji: "🧭" },
  { id: "software", label: "Software y tecnología", emoji: "💻" },
  { id: "marketing", label: "Marketing y ventas", emoji: "📣" },
  { id: "logistics", label: "Logística", emoji: "🚚" },
  { id: "export", label: "Distribución y exportación", emoji: "🌎" },
  { id: "advisory", label: "Asesoría contable o legal", emoji: "⚖️" },
] as const;
export type BusinessNeed = (typeof BUSINESS_NEEDS)[number]["id"];

export type Gender = "female" | "male" | "non_binary" | "undisclosed";

// ── Perfil persistente ───────────────────────────────────────────────

export interface ProfilePhoto {
  url: string;
  /** Color dominante para placeholder mientras carga con señal saturada. */
  blur_color?: string;
  width?: number;
  height?: number;
}

export interface Profile {
  id: UUID;
  username: string;
  full_name: string;
  /** YYYY-MM-DD. Solo la propia cuenta (y el Modo Demo): de otras personas el servidor manda `age`, nunca la fecha. */
  birth_date: string | null;
  /** Edad calculada por el servidor en la tarjeta pública (profile_cards). */
  age?: number | null;
  gender: Gender;
  phone_normalized: string | null; // E.164: +5491122334455
  bio: string;
  photos: ProfilePhoto[]; // máx 4
  loop_video_url: string | null; // máx 5s, sin audio
  music_genres: MusicGenre[];
  spotify_embed_url: string | null;
  /** @ de Instagram (sin "@", minúsculas). Se puede escribir a mano. */
  instagram_username: string | null;
  /** true solo si coincide con la cuenta conectada por OAuth (trigger profile_instagram). */
  instagram_verified: boolean;
  is_verified: boolean;
  /** Aceptó Términos y Privacidad y declaró ser mayor de 18 (onboarding). */
  terms_accepted_at?: ISODate | null;
  created_at: ISODate;
}

/**
 * Perfil adicional de una cuenta (tabla `profile_personas`). Una persona puede tener varios y elige con cuál
 * mostrarse al entrar a cada evento (`event_attendees.persona_id`). El perfil de la cuenta (`Profile`) es el
 * "Perfil principal" de la noche; para eventos corporativos hace falta un perfil `corporate`.
 * Regla: en un evento solo se ve la cara con la que la persona entró (`faceOf`), nunca la de otra vertical.
 */
export interface ProfilePersona {
  id: UUID;
  user_id: UUID;
  kind: EventKind;
  /** Nombre interno para elegirlo (solo lo ve su dueño/a): "Trabajo", "Mi pyme", "Noche techno". */
  label: string;
  /** Nombre que ven los demás en ese evento. */
  display_name: string;
  bio: string; // ≤160
  photos: ProfilePhoto[]; // ≤4
  // Noche
  music_genres: MusicGenre[];
  spotify_embed_url: string | null;
  // Corporativo
  job_title: string; // cargo ≤60
  company: string; // empresa ≤60
  industry: Industry | null;
  looking_for: BusinessNeed[]; // ≤3
  offering: BusinessNeed[]; // ≤3
  linkedin_url: string | null;
  created_at: ISODate;
  // ── Ficha ejecutiva (ROUGE Pro, v1.10) ──
  /** Sitio web de la persona o su empresa (https, limpio). */
  website_url: string | null;
  /** Detalle libre de lo que busca ("Proveedores IT, inversores, talento"). ≤120. */
  looking_for_note: string;
  /** Detalle libre de lo que ofrece ("Soluciones de automatización y cloud"). ≤120. */
  offering_note: string;
  /** Email de contacto profesional (opcional). Lo ve quien permite `privacy_level` (⇔ persona_cards). */
  contact_email: string | null;
  /** Teléfono de contacto profesional, E.164 (opcional; NO es el teléfono de la cuenta, que nunca se muestra). */
  contact_phone: string | null;
  /** Quién ve el email y el teléfono de contacto. Por defecto `strict`. */
  privacy_level: PersonaPrivacyLevel;
}

/**
 * Quién ve el email y el teléfono de contacto de un perfil profesional (⇔ `persona_contact_visible` en SQL):
 *  - `strict`  (por defecto): nadie, hasta aceptar una reunión 1 a 1 o un contacto entre los dos;
 *  - `network`: además, quienes asisten a un evento donde usás este perfil (el networking del evento);
 *  - `public`:  además, el equipo y la organización de esos eventos (CRM y exportación).
 */
export type PersonaPrivacyLevel = "strict" | "network" | "public";
export const PERSONA_PRIVACY_LEVELS: { id: PersonaPrivacyLevel; label: string; description: string }[] = [
  { id: "strict", label: "Estricto", description: "Email y teléfono ocultos hasta aceptar una reunión o un contacto." },
  { id: "network", label: "Networking", description: "Los ven los asistentes de los eventos donde usás este perfil." },
  { id: "public", label: "Público", description: "También la organización del evento (CRM)." },
];

/** Mi cuenta de Instagram conectada (sin token: el token vive solo en el servidor). Supabase: my_instagram(). */
export interface InstagramLink {
  user_id: UUID;
  username: string;
  account_type: string | null;
  connected_at: ISODate;
}

export interface UserBlock {
  id: UUID;
  blocker_id: UUID;
  blocked_user_id: UUID | null;
  blocked_phone_normalized: string | null;
  created_at: ISODate;
}

// ── Eventos ──────────────────────────────────────────────────────────

export interface LineupSlot {
  id: string;
  artist: string;
  starts_at: ISODate;
  ends_at: ISODate;
  genre?: MusicGenre;
  is_headliner?: boolean;
}

/** Sector del plano en coordenadas relativas 0-100 (rectángulo). */
export interface VenueSector {
  id: string;
  name: string;
  /** stage / stand / meeting: sectores de eventos corporativos (escenario, stands de expositores, salas). */
  kind: "dancefloor" | "bar" | "vip" | "outdoor" | "entrance" | "booth" | "restroom" | "lounge" | "stage" | "stand" | "meeting";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VenueLayout {
  /** Relación de aspecto del plano (ancho / alto). */
  aspect: number;
  sectors: VenueSector[];
}

// ── Marcas (productoras / fiestas) ─────────────────────────────────

/**
 * Marca de una productora o fiesta: logo y colores que personalizan la app de sus eventos,
 * y la cuenta de cobro (Mercado Pago). Los datos visibles son públicos (la pantalla de /join los usa sin sesión).
 */
export interface Brand {
  id: UUID;
  owner_id: UUID;
  name: string;
  logo_url: string | null;
  /** #RRGGBB. Reemplaza al rouge (botones, matches). null = colores de ROUGE. */
  primary_color: string | null;
  /** #RRGGBB. Reemplaza al dorado (barra, perks, Mesa VIP). null = colores de ROUGE. */
  accent_color: string | null;
  /** Cobros online activos (lo escribe SOLO el servidor al conectar/desconectar Mercado Pago). */
  payments_enabled: boolean;
  created_at: ISODate;
}

/** Cuenta de cobro conectada de una marca, SIN tokens (solo la ve su dueño/a: RPC my_brand_payments). */
export interface BrandPaymentAccount {
  brand_id: UUID;
  provider: "mercadopago";
  /** Apodo o email de la cuenta de Mercado Pago. */
  account_label: string;
  live_mode: boolean;
  connected_at: ISODate;
}

export interface RougeEvent {
  id: UUID;
  /** Vertical del evento: noche (ROUGE) o corporativo (ROUGE Pro). No cambia una vez que entró alguien. */
  kind: EventKind;
  /** Networking (grilla, conectar, reuniones) solo entre quienes ya pasaron por la puerta. */
  networking_checkin_only: boolean;
  slug: string;
  name: string;
  description: string;
  venue_name: string;
  venue_map_url: string | null; // null → plano vectorial desde venue_layout_json
  venue_layout_json: VenueLayout;
  lineup_json: LineupSlot[];
  cover_url: string | null;
  starts_at: ISODate;
  ends_at: ISODate;
  lobby_opens_at: ISODate;
  lobby_expires_at: ISODate;
  max_capacity: number;
  master_invite_code: string;
  created_by: UUID | null;
  created_at: ISODate;
  /** Marca del evento (logo, colores y cuenta de cobro). Tiene que ser de quien creó el evento. */
  brand_id: UUID | null;
  /** Logo de esta edición (si no, el de la marca). */
  logo_url: string | null;
  /** Colores de esta edición (si no, los de la marca; si no, los de ROUGE). */
  theme_primary: string | null;
  theme_accent: string | null;
  /** Privacidad: solo aparece en la grilla quien ya ingresó por la puerta (checked_in_at). */
  require_checkin_for_lobby?: boolean;
  /**
   * Secreto de los QR dinámicos del evento (TOTP). NUNCA llega a los asistentes: en Supabase solo lo reciben la puerta
   * y la barra (RPC event_qr_secret) para validar sin conexión. En el Modo Demo vive en el estado.
   */
  qr_secret?: string | null;
  /** Módulos activos del evento (null = todos, eventos anteriores a v1.8). Ver engine/features.ts. */
  features?: import("@/lib/engine/features").EventFeatureFlags | null;
  /** Ciclo de vida: borrador (no se puede entrar), preventa, en vivo, terminado. */
  lifecycle_status?: EventLifecycle;
}

export type EventLifecycle = "draft" | "presale" | "live" | "ended";

/** Configuración de la organización (cuenta del dueño/a). La edita ROUGE HQ. */
export interface OrganizationSettings {
  organization_id: UUID;
  /** true = el dueño/a crea sus eventos y prende/apaga módulos desde /admin/events con el mismo creador. */
  allow_owner_self_service: boolean;
  updated_at: ISODate;
}

/**
 * Lista / lote de ingreso (ej. "Lista Free de Vicky"). Hasta `free_until` entra gratis; después, en la puerta se
 * cobra `late_price` (conversión tardía) antes de dejar pasar.
 */
export interface TicketList {
  id: UUID;
  event_id: UUID;
  name: string;
  free_until: ISODate | null;
  late_price: number;
  created_at: ISODate;
}

export type LatePaymentMethod = "cash" | "mercadopago" | "transfer";

/** Equipo del evento (tabla `event_staff`). Quien crea el evento es "owner" aunque no tenga fila. */
export type StaffRole = "owner" | "manager" | "bartender" | "waiter" | "security" | "promoter";

export interface EventStaff {
  event_id: UUID;
  user_id: UUID;
  role: StaffRole;
  created_at: ISODate;
}

// ── Staff por organización, terminales y auditoría ─────────────────

/**
 * Organización = la cuenta del dueño/a (quien crea los eventos y las marcas). `organization_id` es su user id:
 * cada dueño/a gestiona SOLO su staff y sus eventos.
 */
export type StaffScope = "all_org_events" | "specific_events";

/** Alta de staff de una organización (vía invitación de 1 uso). Complementa a `event_staff` (alta por @usuario). */
export interface StaffAssignment {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: Exclude<StaffRole, "owner">;
  scope: StaffScope;
  /** Solo con scope = specific_events. */
  event_ids: UUID[];
  /** Puerta y barra: permisos activos solo de 2 h antes del inicio a 1 h después del cierre de cada evento. */
  access_window: boolean;
  /** Kill switch: baja inmediata (se conserva la fila para la auditoría). */
  revoked_at: ISODate | null;
  created_by: UUID;
  created_at: ISODate;
}

/** Invitación de staff de un solo uso (link / QR). Caduca a las 2 h. Solo se guarda el hash del token. */
export interface StaffInvite {
  id: UUID;
  organization_id: UUID;
  role: Exclude<StaffRole, "owner">;
  scope: StaffScope;
  event_ids: UUID[];
  access_window: boolean;
  token_hash: string;
  expires_at: ISODate;
  used_at: ISODate | null;
  used_by: UUID | null;
  revoked_at: ISODate | null;
  created_by: UUID;
  created_at: ISODate;
}

/**
 * PIN personal (4-6 dígitos) para operar una terminal en Modo Kiosco (tablet fija en barra o puerta).
 * Demo: `pin_hash` = sha256(org:user:pin). Supabase: bcrypt en el servidor, el cliente nunca lo recibe (null).
 */
export interface TerminalPin {
  organization_id: UUID;
  user_id: UUID;
  pin_hash: string | null;
  updated_at: ISODate;
}

export type AuditAction =
  | "staff.invited"
  | "staff.joined"
  | "staff.revoked"
  | "staff.role_changed"
  | "staff.pin_set"
  | "kiosk.unlocked"
  | "kiosk.failed"
  | "door.check_in"
  | "door.rejected"
  | "bar.delivered"
  | "perk.redeemed"
  | "courtesy.issued"
  | "menu.price_changed"
  | "code.revoked"
  | "attendee.removed"
  | "report.created"
  | "account.deleted"
  | "event.created"
  | "event.updated"
  | "event.modules_changed";

/** Registro inmutable (append-only) de acciones sensibles. En SQL: sin UPDATE/DELETE, lo escriben triggers y RPCs. */
export interface AuditEntry {
  id: UUID;
  organization_id: UUID | null;
  event_id: UUID | null;
  /** Cuenta que ejecutó la acción (en kiosco: la cuenta de la terminal). */
  actor_id: UUID | null;
  /** Persona que operó la terminal con su PIN (Modo Kiosco). */
  operator_id: UUID | null;
  action: AuditAction;
  target: string | null;
  details: Record<string, string | number | boolean | null>;
  created_at: ISODate;
}

export type ReportReason = "harassment" | "fake_profile" | "underage" | "violence" | "spam" | "other";

/** Reporte de un asistente: alerta en vivo al panel de seguridad del evento. */
export interface UserReport {
  id: UUID;
  event_id: UUID | null;
  reporter_id: UUID;
  reported_user_id: UUID;
  reason: ReportReason;
  details: string;
  status: "open" | "reviewed";
  reviewed_by: UUID | null;
  created_at: ISODate;
}

export interface EventInviteCode {
  id: UUID;
  event_id: UUID;
  code: string;
  is_used: boolean;
  used_by_user_id: UUID | null;
  used_at: ISODate | null;
  /** Referencia de la entrada en el sistema del cliente (ticketera). Única por evento: hace idempotente la API. */
  external_ref: string | null;
  /** Etiqueta libre (ej. "VIP", "General"). */
  label: string | null;
  source: "panel" | "api";
  api_key_id: UUID | null;
  /** Anulado (ej. entrada reembolsada): deja de servir para entrar. */
  revoked_at: ISODate | null;
  /** Escaneado en la puerta (ingreso físico). Distinto de `is_used` (alguien lo usó para entrar a la app). */
  checked_in_at: ISODate | null;
  /** Terminal (dispositivo) que lo escaneó: si otra terminal lo intenta, ve cuál y a qué hora. */
  checked_in_terminal?: string | null;
  /** Lista / lote (Free con conversión tardía). */
  list_id?: UUID | null;
  /** Diferencial cobrado en puerta por llegar después del horario free. */
  late_paid_at?: ISODate | null;
  late_payment_method?: LatePaymentMethod | null;
  /** Titular (para la búsqueda manual en la puerta: nombre, DNI, email). Solo staff de puerta / gestor. */
  holder_name?: string | null;
  holder_dni?: string | null;
  holder_email?: string | null;
  /** Categoría de la entrada (v1.10). Al usarla, la asistencia toma esta categoría. null = asistente. */
  tier: AttendeeTier | null;
  created_at: ISODate;
}

/** Link propio de un RRPP para un evento (`/join/<code>`): atribuye a quienes entran por él. */
export interface PromoterLink {
  id: UUID;
  event_id: UUID;
  user_id: UUID;
  code: string;
  /** Lo que se le paga al RRPP por cada ingreso (lo fija dueño/a o producción). */
  commission_per_entry: number;
  /** Esquema escalonado (v1.7): precio de la entrada para calcular el % y tramos marginales por cantidad vendida. */
  ticket_price?: number;
  commission_tiers?: CommissionTier[];
  /** % adicional sobre lo que consumieron en barra quienes entraron por su link. */
  bar_commission_percent?: number;
  created_at: ISODate;
}

/** Tramo de comisión: desde la entrada N (1-based) en adelante se paga `percent` % del precio de la entrada. */
export interface CommissionTier {
  from: number;
  percent: number;
}

export type ApiScope = "codes:read" | "codes:write";

/** Clave de la API v1 para clientes empresariales (tabla `api_keys`, sin el hash). */
export interface ApiKey {
  id: UUID;
  name: string;
  /** Parte visible de la clave (ej. rk_live_ab12cd34ef). La clave completa se muestra una sola vez. */
  prefix: string;
  created_by: UUID;
  /** null = todos los eventos que administra quien la creó. */
  event_id: UUID | null;
  scopes: ApiScope[];
  last_used_at: ISODate | null;
  revoked_at: ISODate | null;
  created_at: ISODate;
}

/** Persona expulsada de un evento por el organizador (no puede volver a entrar a ESE evento). */
export interface EventBan {
  event_id: UUID;
  user_id: UUID;
  banned_by: UUID | null;
  reason: string | null;
  created_at: ISODate;
}

export interface EventAttendee {
  id: UUID;
  event_id: UUID;
  user_id: UUID;
  mood_tag: MoodTag | null;
  /** Perfil con el que se muestra en este evento (null = Perfil principal; obligatorio en eventos corporativos). */
  persona_id: UUID | null;
  ghost_mode: boolean;
  only_liked_can_icebreak: boolean;
  icebreaker_used: boolean;
  total_spent: number;
  joined_via: "master_link" | "single_use_code" | "squad_link";
  last_active_at: ISODate;
  /** Sectores del plano donde dejó pin esta noche (filtro post-fiesta "coincidieron en tu zona"). Sin coordenadas: privacidad. */
  visited_sectors: string[];
  /** RRPP por cuyo link entró (primer contacto). */
  referred_by: UUID | null;
  /** Escaneado en la puerta con su pase de la app o su entrada. Privado: solo la persona y el equipo. */
  checked_in_at: ISODate | null;
  checked_in_terminal?: string | null;
  /** Lo que ven los demás asistentes: si está acreditado/a, sin la hora (columna generada en SQL). */
  is_checked_in?: boolean;
  /** Categoría de la entrada: define a qué zonas puede pasar (v1.10). La asigna el organizador o su código. */
  tier: AttendeeTier;
  joined_at: ISODate;
}

// ── Categorías y zonas de control (v1.10) ───────────────────────────

/** Categoría (tier) de un asistente. Contraparte SQL: `attendee_tier_t`. */
export type AttendeeTier = "attendee" | "speaker" | "vip" | "press" | "sponsor";
export const ATTENDEE_TIERS: { id: AttendeeTier; label: string }[] = [
  { id: "attendee", label: "ASISTENTE" },
  { id: "speaker", label: "SPEAKER" },
  { id: "vip", label: "VIP" },
  { id: "press", label: "PRENSA" },
  { id: "sponsor", label: "SPONSOR" },
];

/**
 * Zona de control del evento (tabla `event_zones`): una puerta de ingreso (`entrance`, marca la acreditación) o un
 * área interna (`area`: Sala VIP, Auditorio A, Almuerzo ejecutivo). `allowed_tiers` vacío = pasa cualquier categoría.
 */
export interface EventZone {
  id: UUID;
  event_id: UUID;
  name: string;
  kind: "entrance" | "area";
  allowed_tiers: AttendeeTier[];
  sort_order: number;
  is_active: boolean;
  created_at: ISODate;
}

/** Lectura del escáner en una zona (tabla `zone_check_ins`). `zone_id` null = la puerta principal (sin zonas cargadas). */
export interface ZoneCheckIn {
  id: UUID;
  event_id: UUID;
  zone_id: UUID | null;
  user_id: UUID | null;
  code_id: UUID | null;
  staff_id: UUID | null;
  status: "granted" | "denied";
  /** Detalle: ok, already, zone_denied, revoked, banned, not_attendee, other_event, invalid, general_link. */
  reason: string;
  tier: AttendeeTier | null;
  created_at: ISODate;
}

// ── Privacidad ───────────────────────────────────────────────────────

/** Ajustes de privacidad de la cuenta (tabla `privacy_settings`). Sin fila = DEFAULT_PRIVACY. */
export interface PrivacySettings {
  user_id: UUID;
  /** Entrar a cada evento en Modo Solo Amigos / Contactos (fuera de la grilla). */
  incognito_default: boolean;
  /** false: el pin del plano solo se comparte con el Squad, nunca con matches. */
  pin_share_matches: boolean;
  /** Empresa y cargo ocultos hasta aceptar una reunión o un contacto (LinkedIn siempre oculto hasta entonces). */
  pro_details_after_meeting: boolean;
  updated_at: ISODate;
}

// ── Reuniones y puntos de encuentro ──────────────────────────────────

export type VenueSpotKind = "room" | "table" | "point";

/** Sala, mesa o punto de encuentro del evento (tabla `venue_spots`), cargado por el organizador. */
export interface VenueSpot {
  id: UUID;
  event_id: UUID;
  name: string;
  kind: VenueSpotKind;
  /** Reuniones a la vez (null = sin límite). */
  capacity: number | null;
  coord_x: number | null;
  coord_y: number | null;
  is_active: boolean;
  created_at: ISODate;
}

export type MeetingStatus = "pending" | "accepted" | "rescheduled" | "declined" | "cancelled";
/** Estado que se muestra: "completed" = aceptada y ya terminó (derivado, no se guarda). */
export type MeetingDisplayStatus = MeetingStatus | "completed";
export type MeetingLocationKind = "spot" | "pin" | "tbd";

/** Reunión 1 a 1 dentro de un evento (tabla `meetings`). */
export interface Meeting {
  id: UUID;
  event_id: UUID;
  requester_id: UUID;
  invitee_id: UUID;
  topic: string;
  starts_at: ISODate;
  duration_min: 15 | 30;
  location_kind: MeetingLocationKind;
  spot_id: UUID | null;
  pin_x: number | null;
  pin_y: number | null;
  pin_label: string | null;
  status: MeetingStatus;
  /** Quién hizo la última propuesta: responde la otra persona. */
  proposed_by: UUID;
  /** Chat que se abre al aceptar. */
  connection_id: UUID | null;
  created_at: ISODate;
  updated_at: ISODate;
}

// ── Agenda multi-track, "Mi Agenda" y Q&A / encuestas en vivo (ROUGE Pro, v1.11) ─────────────

/** Orador/a de una charla. `user_id` lo vincula (opcional) con su perfil en el evento. */
export interface SessionSpeaker {
  user_id: UUID | null;
  name: string;
  /** Cargo ("Directora de Innovación"). */
  role: string;
  company: string;
  avatar_url: string | null;
}

/**
 * Charla o sesión de la agenda de un evento corporativo (tabla `event_sessions`). Horario local del evento
 * (Argentina, UTC-3): `day` = "AAAA-MM-DD", `start_time` / `end_time` = "HH:MM" del mismo día.
 * `spot_id` = pin del plano indoor (sala/punto de `venue_spots`) al que salta "Ubicar sala en el mapa".
 */
export interface EventSession {
  id: UUID;
  event_id: UUID;
  title: string;
  description: string;
  /** Track temático ("Tecnología & IA", "Negocios & Finanzas", "Liderazgo"). */
  track: string;
  /** Sala ("Auditorio Principal", "Sala Directorio B"). */
  room_name: string;
  spot_id: UUID | null;
  day: string;
  start_time: string;
  end_time: string;
  speakers: SessionSpeaker[];
  /** Lugares para agendar (null = sin límite). */
  capacity: number | null;
  /** Personas que la agendaron (contador del servidor: las inscripciones de otros no son legibles). */
  enrolled_count: number;
  /** "En vivo": la organización la activó y habilita Q&A y encuestas. */
  is_live_now: boolean;
  created_at: ISODate;
  updated_at: ISODate;
}

/** Charla en "Mi Agenda" (tabla `session_enrollments`; cada persona ve solo las suyas). */
export interface SessionEnrollment {
  session_id: UUID;
  event_id: UUID;
  user_id: UUID;
  created_at: ISODate;
}

export type QuestionStatus = "open" | "answered" | "hidden";

/**
 * Pregunta al orador (tabla `session_questions`). Nunca guarda quién la hizo: la autoría vive aparte
 * (`session_question_authors`, solo legible por su autor/a). `author_label` = "Nombre · Empresa" o null si es anónima.
 */
export interface SessionQuestion {
  id: UUID;
  session_id: UUID;
  event_id: UUID;
  body: string;
  is_anonymous: boolean;
  author_label: string | null;
  status: QuestionStatus;
  is_featured: boolean;
  upvotes: number;
  created_at: ISODate;
  answered_at: ISODate | null;
}

/** Autoría de una pregunta (Supabase: solo las mías). */
export interface SessionQuestionAuthor {
  question_id: UUID;
  user_id: UUID;
}

/** Voto ▲ a una pregunta (Supabase: solo los míos; el total está en `upvotes`). */
export interface SessionQuestionVote {
  question_id: UUID;
  user_id: UUID;
  created_at: ISODate;
}

export interface PollOption {
  id: string;
  label: string;
}

/** Encuesta rápida en vivo de una charla (tabla `session_polls`). `results` = votos por opción (lo suma el servidor). */
export interface SessionPoll {
  id: UUID;
  session_id: UUID;
  event_id: UUID;
  question: string;
  options: PollOption[];
  results: Record<string, number>;
  status: "open" | "closed";
  created_at: ISODate;
  closed_at: ISODate | null;
}

/** Mi voto en una encuesta (Supabase: solo los míos). */
export interface SessionPollVote {
  poll_id: UUID;
  user_id: UUID;
  option_id: string;
  created_at: ISODate;
}

// ── Conexiones ───────────────────────────────────────────────────────

export type ConnectionType = "regular" | "icebreaker";
export type ConnectionStatus = "pending" | "accepted" | "rejected";

export interface Connection {
  id: UUID;
  event_id: UUID;
  sender_id: UUID;
  receiver_id: UUID;
  type: ConnectionType;
  icebreaker_message: string | null;
  attached_drink_qr_id: UUID | null;
  status: ConnectionStatus;
  created_at: ISODate;
  responded_at: ISODate | null;
}

// ── Squads ───────────────────────────────────────────────────────────

export interface Squad {
  id: UUID;
  event_id: UUID;
  name: string;
  invite_code: string;
  has_vip_table_to_share: boolean;
  base_pin_x: number | null;
  base_pin_y: number | null;
  base_pin_label: string | null;
  created_by: UUID;
  created_at: ISODate;
}

export type SquadMemberStatus = "invited" | "joined";
export type SafetyStatus = "ok" | "rescue_needed" | "home_safe";

export interface SquadMember {
  id: UUID;
  squad_id: UUID;
  user_id: UUID;
  invited_by: UUID | null;
  status: SquadMemberStatus;
  safety_status: SafetyStatus;
  joined_at: ISODate | null;
}

// ── Plano ────────────────────────────────────────────────────────────

export interface MapPin {
  id: UUID;
  event_id: UUID;
  user_id: UUID;
  coord_x: number; // 0-100
  coord_y: number; // 0-100
  sector_name: string | null;
  note: string | null;
  is_rescue_alert: boolean;
  share_with_squad: boolean;
  shared_match_ids: UUID[]; // ids de usuarios (matches) seleccionados manualmente
  expires_at: ISODate;
  created_at: ISODate;
}

// ── Mensajería ───────────────────────────────────────────────────────

export type ConversationType = "direct" | "squad";
export type MessageType = "text" | "image" | "system_alert" | "audio" | "video";

export interface Message {
  id: UUID;
  event_id: UUID;
  conversation_type: ConversationType;
  connection_id: UUID | null;
  squad_id: UUID | null;
  sender_id: UUID;
  message_type: MessageType;
  content: string;
  media_url: string | null;
  created_at: ISODate;
}

// ── Organizador ──────────────────────────────────────────────────────

export type BlastSegment =
  | { kind: "all" }
  | { kind: "squad_min_size"; min: number }
  | { kind: "sector"; sector_name: string }
  | { kind: "mood"; mood: MoodTag }
  | { kind: "top_spenders"; limit: number };

export interface EventBlast {
  id: UUID;
  event_id: UUID;
  title: string;
  message: string;
  target_segment: BlastSegment;
  cta_label: string | null;
  cta_link: string | null;
  is_flash_promo: boolean;
  expires_at: ISODate | null;
  created_at: ISODate;
}

export type PerkType = "free_drink" | "raffle_prize" | "fast_pass" | "gifted_drink";
export type PerkStatus = "available" | "redeemed";

export interface UserPerkQR {
  id: UUID;
  event_id: UUID;
  user_id: UUID;
  squad_id: UUID | null;
  title: string;
  perk_type: PerkType;
  qr_code_string: string;
  status: PerkStatus;
  source: "perk_rule" | "raffle" | "icebreaker_gift" | "manual";
  /** id de la regla, sorteo o conexión que originó el QR (evita duplicados). */
  source_ref_id: UUID | null;
  redeemed_at: ISODate | null;
  created_at: ISODate;
}

/** Regla automática de QR Drop (extensión del esquema: tabla `perk_rules`). */
export interface PerkRule {
  id: UUID;
  event_id: UUID;
  title: string;
  perk_type: PerkType;
  trigger: { kind: "squad_size"; min_members: number; before: ISODate | null };
  is_active: boolean;
  created_at: ISODate;
}

/** Sorteo en vivo (extensión del esquema: tabla `raffles`). */
export type RaffleFilter = "all" | "active_pin" | "in_squad" | "female";
export interface Raffle {
  id: UUID;
  event_id: UUID;
  prize_title: string;
  filter: RaffleFilter;
  winner_user_id: UUID | null;
  winner_perk_id: UUID | null;
  drawn_at: ISODate | null;
  created_at: ISODate;
}

/** Pedido de tema al DJ (extensión del esquema: tabla `song_requests`). */
export interface SongRequest {
  id: UUID;
  event_id: UUID;
  requested_by: UUID;
  title: string;
  artist: string;
  voter_ids: UUID[];
  created_at: ISODate;
}

// ── Barra Express ────────────────────────────────────────────────────

export type DeliveryType = "pin_delivery" | "fast_pickup" | "squad_split" | "icebreaker_gift";
export type BarOrderStatus = "pending" | "preparing" | "ready_qr" | "delivering" | "completed";

export interface BarMenuItem {
  id: string;
  name: string;
  category: "trago" | "cerveza" | "botella" | "sin_alcohol" | "combo";
  price: number;
  emoji: string;
  /** false = "Agotado": se ve en el menú pero no se puede pedir. */
  is_available: boolean;
}

export interface BarOrderItem {
  item_id: string;
  name: string;
  qty: number;
  unit_price: number;
}

/**
 * pay_at_bar: el evento no cobra online (se paga al retirar, como siempre).
 * awaiting_payment: la marca cobra con Mercado Pago y el pago todavía no se acreditó (la barra no lo prepara).
 * paid: pago acreditado (lo confirma el servidor con la API de Mercado Pago).
 */
export type PaymentStatus = "pay_at_bar" | "awaiting_payment" | "paid";

export interface BarOrder {
  id: UUID;
  event_id: UUID;
  user_id: UUID;
  squad_id: UUID | null;
  delivery_type: DeliveryType;
  items_json: BarOrderItem[];
  total_amount: number;
  split_user_ids: UUID[]; // Vaquita / compartido: quiénes lo consumen (cuentas de la mesa)
  pickup_code: string | null;
  pin_coord_x: number | null;
  pin_coord_y: number | null;
  sector_name: string | null;
  status: BarOrderStatus;
  payment_status: PaymentStatus;
  /** Id del pago en Mercado Pago (o "demo-…" en el Modo Demo). */
  payment_ref: string | null;
  paid_at: ISODate | null;
  /** Trago regalado desde el chat: a quién le llega el QR (se emite al acreditarse el pago). */
  gift_to?: UUID | null;
  /** Parte de una reserva de Mesa VIP dividida (Vaquita): el QR grupal se libera al 100 % pagado. */
  vip_reservation_id?: UUID | null;
  created_at: ISODate;
  updated_at: ISODate;
}

// ── Cuentas de la mesa ───────────────────────────────────────────────

/** Reserva de Mesa VIP dividida entre el Squad: una parte (pedido) por integrante, cada uno paga la suya. */
export interface VipReservation {
  id: UUID;
  event_id: UUID;
  squad_id: UUID;
  item_id: string;
  label: string;
  total_amount: number;
  created_by: UUID;
  created_at: ISODate;
}

/** Gasto cargado a mano por un integrante del Squad (mesa, entradas, taxi…). */
export interface SquadExpense {
  id: UUID;
  squad_id: UUID;
  event_id: UUID;
  paid_by: UUID;
  description: string;
  amount: number;
  /** Quiénes lo comparten (partes iguales). */
  participant_ids: UUID[];
  created_at: ISODate;
}

export type SettlementMethod = "mercadopago" | "transfer" | "cash";

/** Transferencia entre integrantes para saldar la cuenta ("Ya te pagué"). La confirma quien recibe. */
export interface SquadSettlement {
  id: UUID;
  squad_id: UUID;
  event_id: UUID;
  from_user: UUID;
  to_user: UUID;
  amount: number;
  method: SettlementMethod;
  confirmed_at: ISODate | null;
  created_at: ISODate;
}

/** Alias o CBU/CVU para que el Squad te transfiera (solo lo ven quienes comparten un Squad con vos). */
export interface PayoutAlias {
  user_id: UUID;
  alias: string;
}

// ── Campañas por WhatsApp (sin API paga) ────────────────────────────

/** Cliente de la organización (asistió a alguno de sus eventos). El teléfono solo lo ve el staff gestor. */
export interface OrgContact {
  user_id: UUID;
  full_name: string;
  phone: string | null;
  birth_date: string;
  /** Consumo acumulado en la barra en todos los eventos de la organización. */
  total_spent: number;
  events_count: number;
  last_event_at: ISODate;
  /** RRPP por el que entró por primera vez. */
  referred_by: UUID | null;
}

export type CampaignSegment = "birthdays_week" | "vip_spenders" | "inactive_30d" | "rrpp_guests" | "all";

export interface Campaign {
  id: UUID;
  organization_id: UUID;
  event_id: UUID | null;
  name: string;
  segment: CampaignSegment;
  /** RRPP puntual para el segmento rrpp_guests (null = todos). */
  promoter_id: UUID | null;
  template: string;
  benefit: string;
  created_by: UUID;
  created_at: ISODate;
}

/** Marca de "Contactado" (el mensaje se manda desde WhatsApp del organizador: wa.me). */
export interface CampaignContact {
  campaign_id: UUID;
  user_id: UUID;
  contacted_at: ISODate;
  contacted_by: UUID;
}

// ── Estado global ────────────────────────────────────────────────────

/** Métricas agregadas que el servidor calcula para el staff (Supabase: RPC event_stats). */
export interface AdminStats {
  event_id: UUID;
  matches: number;
  pending_connections: number;
  icebreakers_sent: number;
  matches_last_hour: number;
  matches_by_user: Record<UUID, number>;
  active_pins?: number;
  meetings_requested?: number;
  meetings_accepted?: number;
}

export interface RougeState {
  /** Versión del formato persistido; si cambia, se re-siembra el demo. */
  version: number;
  seeded_at: ISODate;
  current_user_id: UUID;
  active_event_id: UUID;
  profiles: Profile[];
  /** Perfiles adicionales (los míos y los que otros usan en mis eventos, saneados por persona_cards). */
  profile_personas: ProfilePersona[];
  /** Ajustes de privacidad (Supabase: solo los míos; demo: los de todas las personas). */
  privacy_settings: PrivacySettings[];
  /** Salas, mesas y puntos de encuentro de los eventos cargados. */
  venue_spots: VenueSpot[];
  /** Reuniones (Supabase: solo las mías). */
  meetings: Meeting[];
  /** Zonas de control de los eventos cargados (puertas y áreas). */
  event_zones: EventZone[];
  /** Lecturas del escáner por zona (staff de puerta del evento activo; las más recientes). */
  zone_check_ins: ZoneCheckIn[];
  /** [v1.11] Agenda de los eventos corporativos cargados. */
  event_sessions: EventSession[];
  /** "Mi Agenda" (Supabase: solo las mías). */
  session_enrollments: SessionEnrollment[];
  /** Preguntas al orador (las ocultas solo para la moderación y su autor/a). */
  session_questions: SessionQuestion[];
  /** Autoría de preguntas (Supabase: solo las mías). */
  session_question_authors: SessionQuestionAuthor[];
  /** Votos ▲ (Supabase: solo los míos). */
  session_question_votes: SessionQuestionVote[];
  session_polls: SessionPoll[];
  /** Votos de encuestas (Supabase: solo los míos). */
  session_poll_votes: SessionPollVote[];
  /** Cuentas de Instagram conectadas (demo: todas las personas; Supabase: solo la mía). */
  instagram_links: InstagramLink[];
  user_blocks: UserBlock[];
  events: RougeEvent[];
  brands: Brand[];
  /** Cuentas de cobro de MIS marcas (sin tokens). */
  brand_payment_accounts: BrandPaymentAccount[];
  event_staff: EventStaff[];
  event_invite_codes: EventInviteCode[];
  /** Links de RRPP (staff gestor: todos los del evento; RRPP: el propio). */
  promoter_links: PromoterLink[];
  /** Mis claves de la API (Supabase: solo las que creé). */
  api_keys: ApiKey[];
  event_attendees: EventAttendee[];
  /** Expulsados del evento (staff: los del evento; asistente: solo el propio). */
  event_bans: EventBan[];
  connections: Connection[];
  squads: Squad[];
  squad_members: SquadMember[];
  map_pins: MapPin[];
  messages: Message[];
  event_blasts: EventBlast[];
  user_perks_qrs: UserPerkQR[];
  perk_rules: PerkRule[];
  raffles: Raffle[];
  song_requests: SongRequest[];
  bar_menu: BarMenuItem[];
  bar_orders: BarOrder[];
  squad_expenses: SquadExpense[];
  squad_settlements: SquadSettlement[];
  payout_aliases: PayoutAlias[];
  /** Supabase: números por RRPP calculados en el servidor (RPC promoter_stats). El RRPP no ve a los asistentes. */
  promoter_stats?: { user_id: UUID; link_id: UUID | null; code: string | null; commission_per_entry: number; entries: number; checked_in: number; billable: number; to_pay: number; bar_spend?: number }[] | null;
  /** Modo Demo: evento al que pertenece `bar_menu` y menús de los otros eventos (en Supabase se carga el del activo). */
  bar_menu_event_id?: UUID;
  demo_menus?: Record<UUID, BarMenuItem[]>;
  /** Solo staff en Modo Supabase: conteos de conexiones (que son privadas por RLS). */
  admin_stats?: AdminStats | null;
  /** Staff de MI organización (dueño/a) o mis propias asignaciones (staff). */
  staff_assignments: StaffAssignment[];
  /** Invitaciones de staff de mi organización (sin el token). */
  staff_invites: StaffInvite[];
  /** PINs de terminal (demo: con hash; Supabase: solo si existe, pin_hash null). */
  terminal_pins: TerminalPin[];
  /** Auditoría de mi organización (dueño/a y producción). */
  audit_log: AuditEntry[];
  /** Reportes: los míos (asistente) o los del evento (seguridad, dueño/a, producción). */
  user_reports: UserReport[];
  /** Administradores globales de ROUGE (consola /superadmin). */
  platform_admin_ids: UUID[];
  /** Configuración de organizaciones (la mía; ROUGE HQ: todas). */
  organization_settings?: OrganizationSettings[];
  /** Listas / lotes de ingreso del evento (free con horario límite). */
  ticket_lists: TicketList[];
  /** Consola global (solo administradores de ROUGE en Supabase): tablero y matriz calculados en el servidor. */
  superadmin?: { events: import("@/lib/engine/superadmin").GlobalEventRow[]; staff: import("@/lib/engine/superadmin").GlobalStaffRow[] } | null;
  /** Base de clientes de MI organización (dueño/a, producción): CRM para campañas. Supabase: RPC org_contacts. */
  org_contacts?: OrgContact[];
  campaigns?: Campaign[];
  vip_reservations?: VipReservation[];
  campaign_contacts?: CampaignContact[];
  /** Curvas de 15' de las últimas fechas de la organización (tablero minuto a minuto). Supabase: RPC org_event_curves. */
  event_curves_history?: { event_id: UUID; name: string; starts_at: ISODate; points: { m: number; entries: number; sales: number }[] }[];
  /** Secretos de MIS credenciales dinámicas (pase, perks, pedidos). Supabase: RPC my_qr_secrets. */
  qr_secrets?: { event_id: UUID; kind: "PASS" | "PERK" | "ORDER"; ref: string; secret: string }[];
}
