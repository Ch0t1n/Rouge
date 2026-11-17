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

export const MOOD_TAGS = [
  { id: "with_friends", label: "Voy con amigos", emoji: "👯" },
  { id: "lost_group", label: "Perdí a mi grupo", emoji: "🧭" },
  { id: "at_bar", label: "En la barra", emoji: "🍸" },
  { id: "open_to_meet", label: "Abierto a conocer gente", emoji: "✨" },
  { id: "just_dance", label: "Solo vengo a bailar", emoji: "💃" },
  { id: "after_hunt", label: "Buscando after", emoji: "🌅" },
] as const;
export type MoodTag = (typeof MOOD_TAGS)[number]["id"];

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
  birth_date: string; // YYYY-MM-DD
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
  kind: "dancefloor" | "bar" | "vip" | "outdoor" | "entrance" | "booth" | "restroom" | "lounge";
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
}

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
  | "account.deleted";

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
  created_at: ISODate;
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
  /** Escaneado en la puerta con su pase de la app o su entrada. */
  checked_in_at: ISODate | null;
  joined_at: ISODate;
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
  created_at: ISODate;
  updated_at: ISODate;
}

// ── Cuentas de la mesa ───────────────────────────────────────────────

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

// ── Estado global ────────────────────────────────────────────────────

/** Métricas agregadas que el servidor calcula para el staff (Supabase: RPC event_stats). */
export interface AdminStats {
  event_id: UUID;
  matches: number;
  pending_connections: number;
  icebreakers_sent: number;
  matches_last_hour: number;
  matches_by_user: Record<UUID, number>;
}

export interface RougeState {
  /** Versión del formato persistido; si cambia, se re-siembra el demo. */
  version: number;
  seeded_at: ISODate;
  current_user_id: UUID;
  active_event_id: UUID;
  profiles: Profile[];
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
  promoter_stats?: { user_id: UUID; link_id: UUID | null; code: string | null; commission_per_entry: number; entries: number; checked_in: number; billable: number; to_pay: number }[] | null;
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
}
