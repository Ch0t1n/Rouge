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
}

/** Equipo del evento (tabla `event_staff`). Quien crea el evento es "owner" aunque no tenga fila. */
export type StaffRole = "owner" | "manager" | "bartender" | "waiter" | "security";

export interface EventStaff {
  event_id: UUID;
  user_id: UUID;
  role: StaffRole;
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
}

export interface BarOrderItem {
  item_id: string;
  name: string;
  qty: number;
  unit_price: number;
}

export interface BarOrder {
  id: UUID;
  event_id: UUID;
  user_id: UUID;
  squad_id: UUID | null;
  delivery_type: DeliveryType;
  items_json: BarOrderItem[];
  total_amount: number;
  split_user_ids: UUID[]; // Vaquita de Squad
  pickup_code: string | null;
  pin_coord_x: number | null;
  pin_coord_y: number | null;
  sector_name: string | null;
  status: BarOrderStatus;
  created_at: ISODate;
  updated_at: ISODate;
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
  event_staff: EventStaff[];
  event_invite_codes: EventInviteCode[];
  /** Mis claves de la API (Supabase: solo las que creé). */
  api_keys: ApiKey[];
  event_attendees: EventAttendee[];
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
  /** Solo staff en Modo Supabase: conteos de conexiones (que son privadas por RLS). */
  admin_stats?: AdminStats | null;
}
