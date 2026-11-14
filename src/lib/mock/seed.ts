/**
 * Motor de Mock Data del Modo Demo.
 *
 * Todas las fechas son RELATIVAS a `now`: cada vez que se siembra, la fiesta
 * está "en vivo" (empezó hace 2 h, el DJ invitado está en cabina), así se
 * puede probar el 100% de los flujos en cualquier momento.
 */
import type {
  BarMenuItem,
  BarOrder,
  Connection,
  EventAttendee,
  EventBlast,
  EventInviteCode,
  Gender,
  MapPin,
  Message,
  MoodTag,
  MusicGenre,
  PerkRule,
  Profile,
  Raffle,
  RougeEvent,
  RougeState,
  SongRequest,
  Squad,
  SquadMember,
  UserBlock,
  UserPerkQR,
  VenueLayout,
} from "@/lib/types";

export const STATE_VERSION = 2;

// IDs estables → los links de demo (/join/..., /u/...) no cambian entre re-siembras.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_IDS = {
  event: id(1000),
  organizer: id(999),
  me: id(1),
  squadMain: id(2001),
  squadVip: id(2002),
} as const;

export const VENUE_LAYOUT: VenueLayout = {
  aspect: 3 / 4,
  sectors: [
    { id: "booth", name: "Cabina DJ", kind: "booth", x: 36, y: 4, w: 28, h: 7 },
    { id: "wc", name: "Baños", kind: "restroom", x: 76, y: 4, w: 20, h: 7 },
    { id: "coat", name: "Guardarropa", kind: "lounge", x: 4, y: 4, w: 20, h: 7 },
    { id: "floor", name: "Pista Principal", kind: "dancefloor", x: 8, y: 15, w: 84, h: 33 },
    { id: "bar", name: "Barra Central", kind: "bar", x: 30, y: 52, w: 40, h: 9 },
    { id: "patio", name: "Patio Terraza", kind: "outdoor", x: 4, y: 52, w: 22, h: 31 },
    { id: "bar-terraza", name: "Barra Terraza", kind: "bar", x: 6, y: 55, w: 18, h: 7 },
    { id: "vip", name: "Sector VIP", kind: "vip", x: 74, y: 52, w: 22, h: 31 },
    { id: "lounge", name: "Lounge", kind: "lounge", x: 30, y: 65, w: 40, h: 18 },
    { id: "entry", name: "Entrada", kind: "entrance", x: 36, y: 87, w: 28, h: 9 },
  ],
};

export const BAR_MENU: BarMenuItem[] = [
  { id: "fernet", name: "Fernet con Coca", category: "trago", price: 6500, emoji: "🥃" },
  { id: "gin", name: "Gin Tonic", category: "trago", price: 8000, emoji: "🍸" },
  { id: "speed", name: "Vodka Speed", category: "trago", price: 7500, emoji: "⚡" },
  { id: "aperol", name: "Aperol Spritz", category: "trago", price: 8500, emoji: "🍊" },
  { id: "ipa", name: "Cerveza IPA", category: "cerveza", price: 5000, emoji: "🍺" },
  { id: "agua", name: "Agua sin gas", category: "sin_alcohol", price: 2500, emoji: "💧" },
  { id: "energy", name: "Energizante", category: "sin_alcohol", price: 3500, emoji: "🔋" },
  { id: "combo-fernet", name: "Combo 4 Fernets", category: "combo", price: 22000, emoji: "🎉" },
  { id: "botella-vodka", name: "Botella Vodka + 4 Speed", category: "botella", price: 95000, emoji: "🍾" },
  { id: "champagne", name: "Champagne Brut", category: "botella", price: 60000, emoji: "🥂" },
];

interface Persona {
  n: number;
  username: string;
  full_name: string;
  age: number;
  gender: Gender;
  phone: string;
  bio: string;
  genres: MusicGenre[];
  mood: MoodTag;
  spent: number;
  activeMinAgo: number;
  ghost?: boolean;
  onlyLiked?: boolean;
  spotify?: string;
  verified?: boolean;
}

const PERSONAS: Persona[] = [
  { n: 1, username: "sofi.noche", full_name: "Sofía Benítez", age: 26, gender: "female", phone: "+5491150001001", bio: "Diseñadora de día, raver de noche. Si suena Peggy Gou, estoy en primera fila.", genres: ["House", "Techno", "Pop"], mood: "with_friends", spent: 14500, activeMinAgo: 1, spotify: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT", verified: true },
  { n: 2, username: "cami.beats", full_name: "Camila Ríos", age: 25, gender: "female", phone: "+5491150001002", bio: "Bailo hasta que prendan las luces 💡", genres: ["House", "Reggaetón", "Pop"], mood: "just_dance", spent: 9000, activeMinAgo: 3 },
  { n: 3, username: "juli.rkt", full_name: "Julieta Paz", age: 24, gender: "female", phone: "+5491150001003", bio: "RKT y cachengue o nada. Team after.", genres: ["RKT", "Cachengue", "Reggaetón"], mood: "after_hunt", spent: 6500, activeMinAgo: 6 },
  { n: 4, username: "meli.house", full_name: "Melina Duarte", age: 27, gender: "female", phone: "+5491150001004", bio: "Arquitecta. Me encontrás cerca de la cabina.", genres: ["House", "Electrónica", "Indie"], mood: "with_friends", spent: 21000, activeMinAgo: 2 },
  { n: 5, username: "mateo.techno", full_name: "Mateo Sosa", age: 28, gender: "male", phone: "+5491150001005", bio: "Techno melódico, vinilos y madrugadas largas.", genres: ["Techno", "House", "Electrónica"], mood: "open_to_meet", spent: 32000, activeMinAgo: 1, verified: true },
  { n: 6, username: "lucas.dj", full_name: "Lucas Ferreyra", age: 29, gender: "male", phone: "+5491150001006", bio: "Productor amateur. Te paso mi SoundCloud si bailás conmigo.", genres: ["House", "Techno"], mood: "at_bar", spent: 18000, activeMinAgo: 4 },
  { n: 7, username: "bruno.after", full_name: "Bruno Méndez", age: 27, gender: "male", phone: "+5491150001007", bio: "Conozco todos los afters de Palermo 🌅", genres: ["Techno", "Urbano", "RKT"], mood: "after_hunt", spent: 12500, activeMinAgo: 8 },
  { n: 8, username: "joaco.indie", full_name: "Joaquín Vera", age: 26, gender: "male", phone: "+5491150001008", bio: "Indie, synths y charlas en el patio.", genres: ["Indie", "Pop", "Electrónica"], mood: "open_to_meet", spent: 7000, activeMinAgo: 12 },
  { n: 9, username: "vale.pop", full_name: "Valentina Gómez", age: 23, gender: "female", phone: "+5491150001009", bio: "Pop girlie. Hoy en pareja, vengo por los sorteos 🎟️", genres: ["Pop", "Reggaetón", "Urbano"], mood: "just_dance", spent: 5000, activeMinAgo: 5, ghost: true },
  { n: 10, username: "tomi.vip", full_name: "Tomás Aguirre", age: 30, gender: "male", phone: "+5491150001010", bio: "Mesa VIP con amigos. Sumate si venís con buena onda 🍾", genres: ["Reggaetón", "Urbano", "House"], mood: "with_friends", spent: 115000, activeMinAgo: 2, verified: true },
  { n: 11, username: "nico.urbano", full_name: "Nicolás Paredes", age: 28, gender: "male", phone: "+5491150001011", bio: "Urbano, trap y fernet.", genres: ["Urbano", "Reggaetón", "RKT"], mood: "at_bar", spent: 26000, activeMinAgo: 9 },
  { n: 12, username: "fran.cachengue", full_name: "Francisca Luna", age: 25, gender: "female", phone: "+5491150001012", bio: "Cachengue hasta el amanecer. Solo Rompehielos de gente que conecté 😌", genres: ["Cachengue", "Reggaetón", "Pop"], mood: "open_to_meet", spent: 15500, activeMinAgo: 3, onlyLiked: true },
  // Perfil bloqueado preventivamente por teléfono por la persona demo (ex): invisible para ella.
  { n: 13, username: "gonza.x", full_name: "Gonzalo Ibarra", age: 27, gender: "male", phone: "+5491150009999", bio: "—", genres: ["House", "Techno"], mood: "open_to_meet", spent: 8000, activeMinAgo: 2 },
];

/** Sectores donde cada persona dejó pin esta noche (para "Coincidieron en tu zona"). */
const VISITED: Record<number, string[]> = {
  1: ["Pista Principal", "Barra Central"],
  2: ["Pista Principal"],
  3: ["Patio Terraza", "Barra Terraza"],
  4: ["Pista Principal", "Lounge"],
  5: ["Barra Central", "Pista Principal"],
  6: ["Barra Central"],
  7: ["Patio Terraza"],
  8: ["Lounge", "Patio Terraza"],
  10: ["Sector VIP"],
  11: ["Sector VIP", "Barra Central"],
  12: ["Pista Principal"],
};

const LINEUP = [
  { id: "set-1", artist: "Sol Ortega", genre: "House" as MusicGenre, from: 0, to: 90 },
  { id: "set-2", artist: "DJ Invitado: Kaleb Rivas", genre: "Techno" as MusicGenre, from: 90, to: 180 },
  { id: "set-3", artist: "Main Set: NOX B2B Lumen", genre: "Techno" as MusicGenre, from: 180, to: 270, headliner: true },
  { id: "set-4", artist: "Closing: Marea", genre: "House" as MusicGenre, from: 270, to: 360 },
];

export function createSeedState(now = Date.now()): RougeState {
  const t = (minFromNow: number) => new Date(now + minFromNow * 60_000).toISOString();
  const START = -120; // la fiesta arrancó hace 2 h
  const END = START + 360; // dura 6 h
  const birth = (age: number, n: number) => {
    const d = new Date(now);
    return `${d.getFullYear() - age}-${String(((n * 5) % 12) + 1).padStart(2, "0")}-${String(((n * 7) % 27) + 1).padStart(2, "0")}`;
  };

  // ── Perfiles ─────────────────────────────────────────────────────
  const profiles: Profile[] = [
    {
      id: DEMO_IDS.organizer,
      username: "rouge.staff",
      full_name: "Staff ROUGE",
      birth_date: birth(32, 0),
      gender: "undisclosed",
      phone_normalized: "+5491150000000",
      bio: "Organización del evento.",
      photos: [],
      loop_video_url: null,
      music_genres: [],
      spotify_embed_url: null,
      is_verified: true,
      created_at: t(-60 * 24 * 30),
    },
    ...PERSONAS.map<Profile>((p) => ({
      id: id(p.n),
      username: p.username,
      full_name: p.full_name,
      birth_date: birth(p.age, p.n),
      gender: p.gender,
      phone_normalized: p.phone,
      bio: p.bio,
      photos: [1, 2].map((k) => ({ url: `/demo/avatars/${p.username}-${k}.svg`, width: 600, height: 800, blur_color: "#121216" })),
      loop_video_url: null,
      music_genres: p.genres,
      spotify_embed_url: p.spotify ?? null,
      is_verified: !!p.verified,
      created_at: t(-60 * 24 * (40 - p.n)),
    })),
  ];

  // ── Evento ───────────────────────────────────────────────────────
  const event: RougeEvent = {
    id: DEMO_IDS.event,
    slug: "bresh-sabado",
    name: "ROUGE Night × Bresh Sábado",
    description: "La noche más grande del mes. Line-up de house y techno, Mesa VIP, Barra Express y sorteos en vivo.",
    venue_name: "Club Crobar · Palermo",
    venue_map_url: null,
    venue_layout_json: VENUE_LAYOUT,
    lineup_json: LINEUP.map((s) => ({
      id: s.id,
      artist: s.artist,
      genre: s.genre,
      is_headliner: !!s.headliner,
      starts_at: t(START + s.from),
      ends_at: t(START + s.to),
    })),
    cover_url: null,
    starts_at: t(START),
    ends_at: t(END),
    lobby_opens_at: t(START - 48 * 60),
    lobby_expires_at: t(END + 24 * 60),
    max_capacity: 1800,
    master_invite_code: "BRESH26",
    created_by: DEMO_IDS.organizer,
    created_at: t(-60 * 24 * 7),
  };

  const invite_codes: EventInviteCode[] = Array.from({ length: 24 }, (_, i) => {
    const used = i < 6;
    return {
      id: id(5000 + i),
      event_id: event.id,
      code: `RG${String(7300 + i * 37).padStart(4, "0")}${"KXQMPZ"[i % 6]}${"ABCDEF"[(i * 5) % 6]}`,
      is_used: used,
      used_by_user_id: used ? id(i + 2) : null,
      used_at: used ? t(START - 30 + i * 5) : null,
      created_at: t(-60 * 24 * 3),
    };
  });

  // ── Asistentes ───────────────────────────────────────────────────
  const attendees: EventAttendee[] = PERSONAS.map((p, i) => ({
    id: id(3000 + p.n),
    event_id: event.id,
    user_id: id(p.n),
    mood_tag: p.mood,
    ghost_mode: !!p.ghost,
    only_liked_can_icebreak: !!p.onlyLiked,
    icebreaker_used: p.n === 7, // Bruno ya usó su bala con Sofi
    total_spent: p.spent,
    joined_via: i < 6 ? "single_use_code" : i % 2 ? "master_link" : "squad_link",
    last_active_at: t(-p.activeMinAgo),
    visited_sectors: VISITED[p.n] ?? [],
    joined_at: t(START - 40 + i * 6),
  }));

  // ── Bloqueos ─────────────────────────────────────────────────────
  const user_blocks: UserBlock[] = [
    // Lista negra preventiva de Sofi: el número de su ex (Gonzalo) → invisibilidad mutua
    { id: id(4001), blocker_id: DEMO_IDS.me, blocked_user_id: null, blocked_phone_normalized: "+5491150009999", created_at: t(-60 * 24 * 10) },
  ];

  // ── Conexiones ───────────────────────────────────────────────────
  const conn = (n: number, from: number, to: number, status: Connection["status"], minAgo: number, extra: Partial<Connection> = {}): Connection => ({
    id: id(6000 + n),
    event_id: event.id,
    sender_id: id(from),
    receiver_id: id(to),
    type: "regular",
    icebreaker_message: null,
    attached_drink_qr_id: null,
    status,
    created_at: t(-minAgo),
    responded_at: status === "pending" ? null : t(-minAgo + 2),
    ...extra,
  });

  const connections: Connection[] = [
    conn(1, 5, 1, "accepted", 55), // Mateo ↔ Sofi (match con chat)
    conn(2, 6, 1, "pending", 14), // Lucas → Sofi (solicitud normal)
    conn(3, 7, 1, "pending", 9, { type: "icebreaker", icebreaker_message: "¿Vos sos la que estaba en primera fila con Sol Ortega? Te debo un trago por esa energía 🔥" }), // Rompehielos
    conn(4, 1, 8, "pending", 20), // Sofi → Joaquín
    conn(5, 2, 10, "accepted", 70), // Cami ↔ Tomi
    conn(6, 3, 7, "accepted", 40), // Juli ↔ Bruno
    conn(7, 4, 6, "accepted", 33), // Meli ↔ Lucas
    conn(8, 12, 5, "pending", 18), // Fran → Mateo
    conn(9, 5, 4, "accepted", 25), // Mateo ↔ Meli
    conn(10, 11, 2, "accepted", 15), // Nico ↔ Cami
  ];

  // ── Squads ───────────────────────────────────────────────────────
  const squads: Squad[] = [
    {
      id: DEMO_IDS.squadMain,
      event_id: event.id,
      name: "Las Pibas del Sábado",
      invite_code: "SQ-PIBAS",
      has_vip_table_to_share: false,
      base_pin_x: 50,
      base_pin_y: 57,
      base_pin_label: "Columna dorada de la Barra Central",
      created_by: DEMO_IDS.me,
      created_at: t(START - 90),
    },
    {
      id: DEMO_IDS.squadVip,
      event_id: event.id,
      name: "Mesa 7 · Los del Fondo",
      invite_code: "SQ-MESA7",
      has_vip_table_to_share: true,
      base_pin_x: 85,
      base_pin_y: 66,
      base_pin_label: "Mesa 7 — Sector VIP",
      created_by: id(10),
      created_at: t(START - 60),
    },
  ];

  const member = (n: number, squad: string, user: number, invitedBy: number | null, minAgo: number, status: SquadMember["status"] = "joined"): SquadMember => ({
    id: id(7000 + n),
    squad_id: squad,
    user_id: id(user),
    invited_by: invitedBy ? id(invitedBy) : null,
    status,
    safety_status: "ok",
    joined_at: status === "joined" ? t(-minAgo) : null,
  });

  const squad_members: SquadMember[] = [
    member(1, DEMO_IDS.squadMain, 1, null, 210),
    member(2, DEMO_IDS.squadMain, 2, 1, 205),
    member(3, DEMO_IDS.squadMain, 3, 1, 200),
    member(4, DEMO_IDS.squadMain, 4, 1, 190),
    member(5, DEMO_IDS.squadMain, 12, 1, 0, "invited"), // invitación pendiente a Fran
    member(6, DEMO_IDS.squadVip, 10, null, 180),
    member(7, DEMO_IDS.squadVip, 11, 10, 175),
    member(8, DEMO_IDS.squadVip, 6, 10, 170),
  ];

  // ── Pines (15 min) ───────────────────────────────────────────────
  const pin = (n: number, user: number, x: number, y: number, sector: string, minAgo: number, squad: boolean, matches: number[] = [], note: string | null = null): MapPin => ({
    id: id(8000 + n),
    event_id: event.id,
    user_id: id(user),
    coord_x: x,
    coord_y: y,
    sector_name: sector,
    note,
    is_rescue_alert: false,
    share_with_squad: squad,
    shared_match_ids: matches.map(id),
    expires_at: t(15 - minAgo),
    created_at: t(-minAgo),
  });

  const map_pins: MapPin[] = [
    pin(1, 2, 38, 30, "Pista Principal", 3, true, [], "Frente a la cabina 🪩"),
    pin(2, 4, 62, 24, "Pista Principal", 6, true),
    pin(3, 3, 14, 70, "Patio Terraza", 9, true, [], "Fumando en el patio"),
    pin(4, 5, 46, 56, "Barra Central", 2, false, [1], "Te espero acá 🍸"), // Mateo comparte SOLO con Sofi
    pin(5, 10, 86, 64, "Sector VIP", 4, true),
    pin(6, 11, 80, 72, "Sector VIP", 5, true),
  ];

  // ── Mensajes ─────────────────────────────────────────────────────
  const msg = (n: number, sender: number, minAgo: number, content: string, ref: { squad?: string; connection?: string }, type: Message["message_type"] = "text"): Message => ({
    id: id(9000 + n),
    event_id: event.id,
    conversation_type: ref.squad ? "squad" : "direct",
    connection_id: ref.connection ?? null,
    squad_id: ref.squad ?? null,
    sender_id: id(sender),
    message_type: type,
    content,
    media_url: null,
    created_at: t(-minAgo),
  });

  const S = { squad: DEMO_IDS.squadMain };
  const M = { connection: id(6001) };
  const messages: Message[] = [
    msg(1, 1, 200, "👋 Juli se sumó al Squad", S, "system_alert"),
    msg(2, 1, 190, "🎁 ¡Squad de 4 antes de la 01:00! Tienen un trago de bienvenida en Mis Perks", S, "system_alert"),
    msg(3, 2, 60, "Chicas estoy adelante de todo, el set de Sol está INCREÍBLE", S),
    msg(4, 4, 52, "Voy para allá, guárdenme lugar 🙏", S),
    msg(5, 3, 30, "Yo estoy en el patio tomando aire, en 10 vuelvo", S),
    msg(6, 1, 12, "🚩 ¡Nos vemos en el Punto Base en 10 min!", S, "system_alert"),
    msg(7, 5, 54, "Hola! Te vi bailando cerca de la cabina 😄", M),
    msg(8, 1, 52, "Jaja sí, ¡qué temazo cerró Sol! ¿Vos de qué grupo sos?", M),
    msg(9, 5, 47, "Vine con unos amigos del laburo. ¿Te gusta Kaleb Rivas?", M),
    msg(10, 1, 20, "Mucho! Estoy con mis amigas, después nos cruzamos", M),
    msg(11, 5, 2, "Dale, te compartí mi pin, estoy en la barra central 🍸", M),
  ];

  // ── Perks / QR ───────────────────────────────────────────────────
  const perk_rules: PerkRule[] = [
    {
      id: id(10001),
      event_id: event.id,
      title: "🍹 Trago de Bienvenida — Squad de 4+",
      perk_type: "free_drink",
      trigger: { kind: "squad_size", min_members: 4, before: t(START + 120) },
      is_active: true,
      created_at: t(-60 * 24 * 2),
    },
  ];

  const perk = (n: number, user: number, title: string, type: UserPerkQR["perk_type"], source: UserPerkQR["source"], ref: string | null, minAgo: number, redeemed = false, squad: string | null = null): UserPerkQR => ({
    id: id(11000 + n),
    event_id: event.id,
    user_id: id(user),
    squad_id: squad,
    title,
    perk_type: type,
    qr_code_string: `ROUGE:${type.toUpperCase()}:DEMO${String(n).padStart(6, "0")}`,
    status: redeemed ? "redeemed" : "available",
    source,
    source_ref_id: ref,
    redeemed_at: redeemed ? t(-minAgo + 20) : null,
    created_at: t(-minAgo),
  });

  const user_perks_qrs: UserPerkQR[] = [
    ...[1, 2, 3, 4].map((u, i) => perk(i + 1, u, perk_rules[0].title, "free_drink", "perk_rule", perk_rules[0].id, 190, u === 2 || u === 4, DEMO_IDS.squadMain)),
    perk(5, 1, "⚡ Fast Pass — Fila rápida de barra", "fast_pass", "manual", null, 150),
    perk(6, 7, "🍸 Gin Tonic — regalo de Rompehielos", "gifted_drink", "icebreaker_gift", null, 9),
  ];

  const raffles: Raffle[] = [
    { id: id(12001), event_id: event.id, prize_title: "Botella de Champagne en el VIP", filter: "active_pin", winner_user_id: null, winner_perk_id: null, drawn_at: null, created_at: t(-30) },
  ];

  // ── Text Blasts ──────────────────────────────────────────────────
  const event_blasts: EventBlast[] = [
    { id: id(13001), event_id: event.id, title: "🎟️ ¡Bienvenidos a ROUGE Night!", message: "Armá tu Squad de 4 antes de la 01:00 y desbloqueá un trago de bienvenida para cada una.", target_segment: { kind: "all" }, cta_label: "Armar Squad", cta_link: "/squad", is_flash_promo: false, expires_at: null, created_at: t(START - 10) },
    { id: id(13002), event_id: event.id, title: "⚡ FLASH PROMO · 20 min", message: "2x1 en Barra Terraza AHORA. Mostrá la app en la barra.", target_segment: { kind: "all" }, cta_label: "Ver en el plano", cta_link: "/map", is_flash_promo: true, expires_at: t(14), created_at: t(-6) },
  ];

  // ── Temas pedidos al DJ ──────────────────────────────────────────
  const song_requests: SongRequest[] = [
    { id: id(14001), event_id: event.id, requested_by: id(2), title: "Mysterious Times", artist: "Sash!", voter_ids: [2, 4, 5, 6, 11].map(id), created_at: t(-50) },
    { id: id(14002), event_id: event.id, requested_by: id(5), title: "Losing It", artist: "Fisher", voter_ids: [5, 7, 8, 1].map(id), created_at: t(-44) },
    { id: id(14003), event_id: event.id, requested_by: id(3), title: "Tusa (Remix)", artist: "Karol G", voter_ids: [3, 12, 9].map(id), created_at: t(-35) },
    { id: id(14004), event_id: event.id, requested_by: id(8), title: "Midnight City", artist: "M83", voter_ids: [8].map(id), created_at: t(-12) },
  ];

  // ── Pedidos de barra ─────────────────────────────────────────────
  const line = (itemId: string, qty: number) => {
    const it = BAR_MENU.find((i) => i.id === itemId)!;
    return { item_id: it.id, name: `${it.emoji} ${it.name}`, qty, unit_price: it.price };
  };
  const order = (n: number, user: number, type: BarOrder["delivery_type"], items: ReturnType<typeof line>[], status: BarOrder["status"], minAgo: number, extra: Partial<BarOrder> = {}): BarOrder => ({
    id: id(15000 + n),
    event_id: event.id,
    user_id: id(user),
    squad_id: null,
    delivery_type: type,
    items_json: items,
    total_amount: items.reduce((a, i) => a + i.qty * i.unit_price, 0),
    split_user_ids: [],
    pickup_code: type === "fast_pickup" || type === "squad_split" ? `P${String(n).padStart(3, "0")}` : null,
    pin_coord_x: null,
    pin_coord_y: null,
    sector_name: null,
    status,
    created_at: t(-minAgo),
    updated_at: t(-Math.max(0, minAgo - 3)),
    ...extra,
  });

  const bar_orders: BarOrder[] = [
    order(1, 10, "pin_delivery", [line("botella-vodka", 1)], "delivering", 8, { squad_id: DEMO_IDS.squadVip, pin_coord_x: 85, pin_coord_y: 66, sector_name: "Sector VIP" }),
    order(2, 5, "fast_pickup", [line("gin", 2)], "ready_qr", 6),
    order(3, 1, "squad_split", [line("combo-fernet", 1)], "preparing", 4, { squad_id: DEMO_IDS.squadMain, split_user_ids: [1, 2, 3, 4].map(id) }),
    order(4, 11, "fast_pickup", [line("fernet", 1), line("energy", 1)], "pending", 1),
    order(5, 6, "pin_delivery", [line("ipa", 2)], "pending", 2, { pin_coord_x: 40, pin_coord_y: 33, sector_name: "Pista Principal" }),
    order(6, 7, "icebreaker_gift", [line("gin", 1)], "ready_qr", 9),
    order(7, 4, "fast_pickup", [line("aperol", 1)], "completed", 40),
    order(8, 2, "fast_pickup", [line("speed", 1)], "completed", 55),
  ];

  // Vincular el trago rompehielos de Bruno a su conexión con Sofi
  connections[2].attached_drink_qr_id = user_perks_qrs[5].id;
  user_perks_qrs[5] = { ...user_perks_qrs[5], user_id: DEMO_IDS.me, source_ref_id: bar_orders[5].id };

  return {
    version: STATE_VERSION,
    seeded_at: new Date(now).toISOString(),
    current_user_id: DEMO_IDS.me,
    active_event_id: event.id,
    profiles,
    user_blocks,
    events: [event],
    event_invite_codes: invite_codes,
    event_attendees: attendees,
    connections,
    squads,
    squad_members,
    map_pins,
    messages,
    event_blasts,
    user_perks_qrs,
    perk_rules,
    raffles,
    song_requests,
    bar_menu: BAR_MENU,
    bar_orders,
  };
}
