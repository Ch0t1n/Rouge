-- ════════════════════════════════════════════════════════════════════════
--  ROUGE — Esquema Supabase / PostgreSQL
--  Plataforma social y operativa para eventos (B2B2C)
--
--  Orden: extensiones → enums → tablas → índices → helpers → RLS →
--         RPCs de negocio → triggers → realtime → storage
--
--  Espejo TypeScript: src/lib/types.ts
--  Las reglas de negocio replican src/lib/engine/actions.ts (Modo Demo).
--
--  Columnas/tablas marcadas con  [ext]  extienden la especificación base
--  porque el MVP las necesita (fin del evento, plano por sectores, staff,
--  menú de barra, reglas de perks, sorteos, pedidos de temas, entregas de blasts).
-- ════════════════════════════════════════════════════════════════════════

-- Supabase instala las extensiones en el schema `extensions` (no en public).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;   -- gen_random_bytes()
create extension if not exists citext with schema extensions;     -- usernames case-insensitive
set search_path = public, extensions;

-- ────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────────────────
do $$ begin
  create type gender_t            as enum ('female','male','non_binary','undisclosed');
  create type mood_tag_t          as enum ('with_friends','lost_group','at_bar','open_to_meet','just_dance','after_hunt');
  create type join_via_t          as enum ('master_link','single_use_code','squad_link');
  create type connection_type_t   as enum ('regular','icebreaker');
  create type connection_status_t as enum ('pending','accepted','rejected');
  create type squad_member_status_t as enum ('invited','joined');
  create type safety_status_t     as enum ('ok','rescue_needed','home_safe');
  create type conversation_type_t as enum ('direct','squad');
  create type message_type_t      as enum ('text','image','system_alert','audio','video');
  create type perk_type_t         as enum ('free_drink','raffle_prize','fast_pass','gifted_drink');
  create type perk_status_t       as enum ('available','redeemed');
  create type perk_source_t       as enum ('perk_rule','raffle','icebreaker_gift','manual');
  create type delivery_type_t     as enum ('pin_delivery','fast_pickup','squad_split','icebreaker_gift');
  create type bar_order_status_t  as enum ('pending','preparing','ready_qr','delivering','completed');
  create type staff_role_t        as enum ('owner','manager','bartender','waiter','security');
  create type raffle_filter_t     as enum ('all','active_pin','in_squad','female');
exception when duplicate_object then null; end $$;
-- [v1.6] RRPP. En el resto del script NO se usa 'promoter'::staff_role_t (Postgres no deja usar un valor nuevo de un
-- enum en la misma transacción en que se agrega): se compara como texto (role::text = 'promoter').
alter type staff_role_t add value if not exists 'promoter';

-- ════════════════════════════════════════════════════════════════════════
-- TABLAS
-- ════════════════════════════════════════════════════════════════════════

-- Perfil persistente: se crea una vez y sirve para todos los eventos.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           citext not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  full_name          text   not null check (char_length(full_name) between 1 and 60),
  birth_date         date   not null check (birth_date <= (current_date - interval '18 years')),
  gender             gender_t not null default 'undisclosed',
  phone_normalized   text unique check (phone_normalized ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164
  bio                text not null default '' check (char_length(bio) <= 160),
  photos             jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  loop_video_url     text,                                  -- máx 5 s, sin audio (validado en cliente)
  music_genres       text[] not null default '{}' check (music_genres <@ array['Techno','House','Reggaetón','Cachengue','Pop','RKT','Indie','Urbano','Electrónica']),
  spotify_embed_url  text check (spotify_embed_url is null or spotify_embed_url ~ '^https://open\.spotify\.com/'),
  is_verified        boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Instagram en el perfil: el @ puede escribirse a mano; "verificado" solo si coincide con la cuenta conectada por OAuth.
alter table public.profiles add column if not exists instagram_username text
  check (instagram_username is null or instagram_username ~ '^[a-z0-9._]{1,30}$');
alter table public.profiles add column if not exists instagram_verified boolean not null default false;

-- Cuenta de Instagram conectada (Instagram API with Instagram Login). Tokens SOLO para el servidor:
-- RLS sin políticas + sin privilegios para anon/authenticated. La lee/escribe la API de Next con service role.
create table if not exists public.instagram_accounts (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  ig_user_id        text not null unique,
  username          text not null,
  account_type      text,
  access_token      text not null,
  token_expires_at  timestamptz,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Lista negra: por usuario o por teléfono normalizado (bloqueo preventivo).
create table if not exists public.user_blocks (
  id                        uuid primary key default gen_random_uuid(),
  blocker_id                uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id           uuid references public.profiles(id) on delete cascade,
  blocked_phone_normalized  text check (blocked_phone_normalized ~ '^\+[1-9][0-9]{7,14}$'),
  created_at                timestamptz not null default now(),
  constraint user_blocks_target_chk check (num_nonnulls(blocked_user_id, blocked_phone_normalized) = 1),
  constraint user_blocks_not_self   check (blocked_user_id is distinct from blocker_id)
);

-- [v1.4] Colores de marca: mismas reglas que checkBrandColor() en src/lib/engine/branding.ts
-- (contraste WCAG contra el fondo #070709 y el texto que va encima; nada parecido al cian del Squad).
create or replace function public.color_luminance(p_hex text)
returns double precision language sql immutable set search_path = public, extensions as $$
  select (0.2126 * c[1] + 0.7152 * c[2] + 0.0722 * c[3])::double precision
  from (select array_agg(case when v <= 0.03928 then v / 12.92 else power((v + 0.055) / 1.055, 2.4) end order by i) as c
        from (select i, ('x' || substr(p_hex, 2 * i, 2))::bit(8)::int / 255.0 as v from generate_series(1, 3) as i) x) y;
$$;

create or replace function public.brand_color_error(p_hex text, p_kind text)
returns text language plpgsql immutable set search_path = public, extensions as $$
declare
  l double precision; bg double precision := public.color_luminance('#070709');
  r double precision; g double precision; b double precision; mx double precision; mn double precision; d double precision;
  x double precision; h double precision; sat double precision; dh double precision;
begin
  if p_hex is null then return null; end if;
  if p_hex !~ '^#[0-9A-F]{6}$' then return 'format'; end if;
  r := ('x' || substr(p_hex, 2, 2))::bit(8)::int / 255.0;
  g := ('x' || substr(p_hex, 4, 2))::bit(8)::int / 255.0;
  b := ('x' || substr(p_hex, 6, 2))::bit(8)::int / 255.0;
  mx := greatest(r, g, b); mn := least(r, g, b); d := mx - mn;
  if d > 0 then
    sat := d / (1 - abs(mx + mn - 1));
    x := case when mx = r then (g - b) / d when mx = g then (b - r) / d + 2 else (r - g) / d + 4 end;
    h := (x - 6 * trunc(x / 6)) * 60;            -- mismo resto que el % de JavaScript
    if h < 0 then h := h + 360; end if;
    dh := least(abs(h - 183.529), 360 - abs(h - 183.529));  -- 183.529° = tono del cian del Squad (#00F0FF)
    if sat > 0.35 and dh < 22 then return 'like_squad'; end if;
  end if;
  l := public.color_luminance(p_hex);
  if p_kind = 'primary' then
    if (greatest(l, bg) + 0.05) / (least(l, bg) + 0.05) < 3 then return 'too_dark'; end if;
    if (1.05) / (l + 0.05) < 3 then return 'too_light'; end if;
  elsif (greatest(l, bg) + 0.05) / (least(l, bg) + 0.05) < 4.5 then
    return 'too_dark';
  end if;
  return null;
end $$;

-- [v1.4] Marca de una productora o fiesta: logo y colores que personalizan la app de sus eventos.
-- payments_enabled lo escribe SOLO el servidor (Mercado Pago conectado); el resto, su dueño/a.
create table if not exists public.brands (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  name              text not null check (char_length(trim(name)) between 2 and 40),
  logo_url          text,
  primary_color     text check (public.brand_color_error(primary_color, 'primary') is null),
  accent_color      text check (public.brand_color_error(accent_color, 'accent') is null),
  payments_enabled  boolean not null default false,
  created_at        timestamptz not null default now()
);

-- [v1.4] Cuenta de Mercado Pago de una marca (OAuth). Tokens CIFRADOS (AES-256-GCM) y SOLO para el servidor:
-- RLS sin políticas + sin privilegios para anon/authenticated. La escribe /api/mercadopago con service role.
create table if not exists public.brand_payment_accounts (
  brand_id           uuid primary key references public.brands(id) on delete cascade,
  provider           text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_user_id   text not null,
  account_label      text not null default '',
  live_mode          boolean not null default true,
  access_token_enc   text not null,
  refresh_token_enc  text,
  public_key         text,
  expires_at         timestamptz,
  connected_by       uuid references public.profiles(id) on delete set null,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.events (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name                text not null,
  description         text not null default '',
  venue_name          text not null default '',                           -- [ext]
  venue_map_url       text,                                               -- plano subido (Storage)
  venue_layout_json   jsonb not null default '{"aspect":0.75,"sectors":[]}'::jsonb, -- [ext] sectores en coords 0-100
  lineup_json         jsonb not null default '[]'::jsonb,
  cover_url           text,                                               -- [ext]
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,                               -- [ext] necesario para la caducidad
  lobby_opens_at      timestamptz not null,
  lobby_expires_at    timestamptz not null,
  max_capacity        integer not null default 1000 check (max_capacity > 0),
  master_invite_code  text not null unique default upper(encode(gen_random_bytes(4), 'hex')),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint events_time_chk check (lobby_opens_at <= starts_at and starts_at < ends_at and ends_at <= lobby_expires_at)
);

-- [v1.4] Marca y personalización del evento (si no tiene colores propios, usa los de su marca).
alter table public.events add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.events add column if not exists logo_url text;
alter table public.events add column if not exists theme_primary text check (public.brand_color_error(theme_primary, 'primary') is null);
alter table public.events add column if not exists theme_accent text check (public.brand_color_error(theme_accent, 'accent') is null);

-- [ext] Staff del organizador (dueño, encargados, barra, camareros, seguridad).
create table if not exists public.event_staff (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       staff_role_t not null default 'manager',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.event_invite_codes (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  code             text not null unique,
  is_used          boolean not null default false,
  used_by_user_id  uuid references public.profiles(id) on delete set null,
  used_at          timestamptz,
  created_at       timestamptz not null default now(),
  constraint invite_used_chk check (is_used = (used_by_user_id is not null or used_at is not null))
);

-- [API v1] Códigos emitidos por ticketeras: referencia de su entrada (idempotencia), etiqueta y anulación.
alter table public.event_invite_codes add column if not exists external_ref text check (external_ref is null or char_length(external_ref) between 1 and 120);
alter table public.event_invite_codes add column if not exists label text check (label is null or char_length(label) <= 60);
alter table public.event_invite_codes add column if not exists source text not null default 'panel' check (source in ('panel', 'api'));
alter table public.event_invite_codes add column if not exists api_key_id uuid;
alter table public.event_invite_codes add column if not exists revoked_at timestamptz;
-- [v1.6] Ingreso físico (escáner de la puerta). Distinto de is_used (alguien lo usó para entrar a la app).
alter table public.event_invite_codes add column if not exists checked_in_at timestamptz;
alter table public.event_invite_codes add column if not exists checked_in_by uuid references public.profiles(id) on delete set null;
do $$ begin
  alter table public.event_invite_codes add constraint invite_revoked_chk check (not (is_used and revoked_at is not null));
exception when duplicate_object then null; end $$;
create unique index if not exists invite_codes_external_ref_uq on public.event_invite_codes (event_id, external_ref) where external_ref is not null;
create index if not exists invite_codes_event_created_idx on public.event_invite_codes (event_id, created_at, id);

-- [API v1] Claves de API para clientes empresariales (ticketeras, productoras). La clave completa se muestra
-- UNA vez; acá solo queda su SHA-256. event_id null = todos los eventos que administra quien la creó.
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  prefix        text not null unique,
  key_hash      text not null unique,
  created_by    uuid not null references public.profiles(id) on delete cascade,
  event_id      uuid references public.events(id) on delete cascade,
  scopes        text[] not null default '{codes:read,codes:write}' check (scopes <@ array['codes:read', 'codes:write'] and cardinality(scopes) > 0),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
do $$ begin
  alter table public.event_invite_codes add constraint invite_api_key_fk foreign key (api_key_id) references public.api_keys(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.event_attendees (
  id                       uuid primary key default gen_random_uuid(),
  event_id                 uuid not null references public.events(id) on delete cascade,
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  mood_tag                 mood_tag_t,
  ghost_mode               boolean not null default false,
  only_liked_can_icebreak  boolean not null default false,
  icebreaker_used          boolean not null default false,
  total_spent              numeric(12,2) not null default 0 check (total_spent >= 0),
  joined_via               join_via_t not null default 'master_link',  -- [ext]
  last_active_at           timestamptz not null default now(),         -- [ext] para el algoritmo de afinidad
  visited_sectors          text[] not null default '{}',               -- [ext] sectores con pin (filtro "coincidieron en tu zona"), sin coordenadas
  joined_at                timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.event_attendees add column if not exists visited_sectors text[] not null default '{}';
-- [v1.6] RRPP por cuyo link entró (primer contacto) e ingreso físico escaneado en la puerta.
alter table public.event_attendees add column if not exists referred_by uuid references public.profiles(id) on delete set null;
alter table public.event_attendees add column if not exists checked_in_at timestamptz;

create table if not exists public.connections (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  sender_id             uuid not null references public.profiles(id) on delete cascade,
  receiver_id           uuid not null references public.profiles(id) on delete cascade,
  type                  connection_type_t not null default 'regular',
  icebreaker_message    text check (icebreaker_message is null or char_length(icebreaker_message) <= 140),
  attached_drink_qr_id  uuid,  -- FK agregada luego de crear user_perks_qrs
  status                connection_status_t not null default 'pending',
  created_at            timestamptz not null default now(),
  responded_at          timestamptz,                                   -- [ext]
  constraint connections_not_self check (sender_id <> receiver_id),
  constraint icebreaker_msg_chk  check (type = 'regular' or icebreaker_message is not null)
);

create table if not exists public.squads (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.events(id) on delete cascade,
  name                    text not null check (char_length(name) between 1 and 32),
  invite_code             text not null unique default ('SQ-' || upper(encode(gen_random_bytes(3), 'hex'))),
  has_vip_table_to_share  boolean not null default false,
  base_pin_x              double precision check (base_pin_x between 0 and 100),
  base_pin_y              double precision check (base_pin_y between 0 and 100),
  base_pin_label          text,
  created_by              uuid not null references public.profiles(id) on delete cascade,
  created_at              timestamptz not null default now()
);

create table if not exists public.squad_members (
  id             uuid primary key default gen_random_uuid(),
  squad_id       uuid not null references public.squads(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  invited_by     uuid references public.profiles(id) on delete set null,  -- [ext] para "Squad Leader"
  status         squad_member_status_t not null default 'invited',
  safety_status  safety_status_t not null default 'ok',
  joined_at      timestamptz,
  unique (squad_id, user_id)
);

create table if not exists public.map_pins (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  coord_x           double precision not null check (coord_x between 0 and 100),
  coord_y           double precision not null check (coord_y between 0 and 100),
  sector_name       text,
  note              text check (note is null or char_length(note) <= 60),
  is_rescue_alert   boolean not null default false,
  share_with_squad  boolean not null default true,
  shared_match_ids  uuid[] not null default '{}',
  expires_at        timestamptz not null default (now() + interval '15 minutes'),
  created_at        timestamptz not null default now(),
  constraint pin_audience_chk check (share_with_squad or cardinality(shared_match_ids) > 0)
);

create table if not exists public.messages (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id) on delete cascade,
  conversation_type  conversation_type_t not null,
  connection_id      uuid references public.connections(id) on delete cascade,
  squad_id           uuid references public.squads(id) on delete cascade,
  sender_id          uuid not null references public.profiles(id) on delete cascade,
  message_type       message_type_t not null default 'text',
  content            text not null default '' check (char_length(content) <= 1000),
  media_url          text,
  created_at         timestamptz not null default now(),
  constraint message_target_chk check (
    (conversation_type = 'direct' and connection_id is not null and squad_id is null) or
    (conversation_type = 'squad'  and squad_id is not null and connection_id is null)
  ),
  constraint message_media_chk check (message_type not in ('image','audio','video') or media_url is not null)
);

create table if not exists public.event_blasts (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  title           text not null,
  message         text not null,
  target_segment  jsonb not null default '{"kind":"all"}'::jsonb,  -- {kind:'all'|'squad_min_size'|'sector'|'mood'|'top_spenders', ...}
  cta_label       text,
  cta_link        text,
  is_flash_promo  boolean not null default false,                  -- [ext]
  expires_at      timestamptz,                                     -- [ext] Flash Promos de 20 min
  created_at      timestamptz not null default now()
);

-- [ext] Audiencia materializada al enviar (Realtime notifica solo a destinatarios).
create table if not exists public.blast_deliveries (
  blast_id    uuid not null references public.event_blasts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  primary key (blast_id, user_id)
);

create table if not exists public.user_perks_qrs (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  squad_id        uuid references public.squads(id) on delete set null,
  title           text not null,
  perk_type       perk_type_t not null,
  qr_code_string  text not null unique default ('ROUGE:' || upper(encode(gen_random_bytes(8), 'hex'))),
  status          perk_status_t not null default 'available',
  source          perk_source_t not null default 'manual',        -- [ext]
  source_ref_id   uuid,                                           -- [ext] regla/sorteo/pedido de origen (idempotencia)
  redeemed_at     timestamptz,
  created_at      timestamptz not null default now()
);

do $$ begin
  alter table public.connections
    add constraint connections_drink_fk foreign key (attached_drink_qr_id) references public.user_perks_qrs(id) on delete set null;
exception when duplicate_object then null; end $$;

-- [ext] Reglas automáticas de QR Drops ("Squad de 4 antes de la 01:00").
create table if not exists public.perk_rules (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  title       text not null,
  perk_type   perk_type_t not null default 'free_drink',
  trigger     jsonb not null,   -- {"kind":"squad_size","min_members":4,"before":"2026-11-15T04:00:00Z"}
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- [ext] Sorteos en vivo.
create table if not exists public.raffles (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  prize_title      text not null,
  filter           raffle_filter_t not null default 'all',
  winner_user_id   uuid references public.profiles(id) on delete set null,
  winner_perk_id   uuid references public.user_perks_qrs(id) on delete set null,
  drawn_at         timestamptz,
  created_at       timestamptz not null default now()
);

-- [ext] Pedidos de temas al DJ (votos en array para lectura O(1) en la Pantalla LED).
create table if not exists public.song_requests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  requested_by  uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) <= 80),
  artist        text not null default '' check (char_length(artist) <= 60),
  voter_ids     uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

-- [ext] Menú de Barra Express (los precios SIEMPRE se toman del servidor).
create table if not exists public.bar_menu_items (
  id            text not null,
  event_id      uuid not null references public.events(id) on delete cascade,
  name          text not null,
  category      text not null check (category in ('trago','cerveza','botella','sin_alcohol','combo')),
  price         numeric(12,2) not null check (price >= 0),
  emoji         text not null default '🍸',
  is_available  boolean not null default true,
  primary key (event_id, id)
);

create table if not exists public.bar_orders (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  squad_id        uuid references public.squads(id) on delete set null,
  delivery_type   delivery_type_t not null,
  items_json      jsonb not null check (jsonb_typeof(items_json) = 'array' and jsonb_array_length(items_json) > 0),
  total_amount    numeric(12,2) not null check (total_amount >= 0),
  split_user_ids  uuid[] not null default '{}',                    -- [ext] Vaquita de Squad
  pickup_code     text,                                            -- [ext] retiro por ventanilla rápida
  pin_coord_x     double precision,
  pin_coord_y     double precision,
  sector_name     text,
  status          bar_order_status_t not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()               -- [ext]
);

-- [v1.4] Cobro online de la Barra Express (Mercado Pago de la marca). Solo el servidor marca "paid".
alter table public.bar_orders add column if not exists payment_status text not null default 'pay_at_bar'
  check (payment_status in ('pay_at_bar', 'awaiting_payment', 'paid'));
alter table public.bar_orders add column if not exists payment_ref text;
alter table public.bar_orders add column if not exists paid_at timestamptz;
alter table public.bar_orders add column if not exists mp_preference_id text;

-- [v1.4] Cuentas de la mesa: gastos cargados a mano y transferencias entre integrantes del Squad.
create table if not exists public.squad_expenses (
  id               uuid primary key default gen_random_uuid(),
  squad_id         uuid not null references public.squads(id) on delete cascade,
  event_id         uuid not null references public.events(id) on delete cascade,
  paid_by          uuid not null references public.profiles(id) on delete cascade,
  description      text not null check (char_length(trim(description)) between 1 and 60),
  amount           numeric(12,2) not null check (amount > 0 and amount <= 50000000),
  participant_ids  uuid[] not null check (cardinality(participant_ids) > 0),
  created_at       timestamptz not null default now()
);

create table if not exists public.squad_settlements (
  id            uuid primary key default gen_random_uuid(),
  squad_id      uuid not null references public.squads(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  from_user     uuid not null references public.profiles(id) on delete cascade,
  to_user       uuid not null references public.profiles(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0 and amount <= 50000000),
  method        text not null default 'transfer' check (method in ('mercadopago', 'transfer', 'cash')),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint settlement_users_chk check (from_user <> to_user)
);

-- Alias o CBU/CVU para que el Squad te transfiera (solo lo ven quienes comparten un Squad con vos).
create table if not exists public.payout_aliases (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  alias       text not null check (alias ~ '^[0-9]{22}$' or (alias ~ '^[a-z0-9.-]{6,20}$' and alias ~ '[a-z]')),
  updated_at  timestamptz not null default now()
);

-- [v1.6] Link propio de cada RRPP por evento (/join/<code>). Comisión por ingreso que fija dueño/a o producción.
create table if not exists public.promoter_links (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events(id) on delete cascade,
  user_id               uuid not null references public.profiles(id) on delete cascade,
  code                  text not null unique,
  commission_per_entry  numeric(12,2) not null default 0 check (commission_per_entry >= 0 and commission_per_entry <= 1000000),
  created_at            timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists idx_attendees_referred on public.event_attendees (event_id, referred_by) where referred_by is not null;
-- [v1.7] Esquema escalonado del RRPP: precio de la entrada, tramos marginales (% por cantidad) y % sobre la barra.
alter table public.promoter_links add column if not exists ticket_price numeric(12,2) not null default 0 check (ticket_price >= 0);
alter table public.promoter_links add column if not exists commission_tiers jsonb not null default '[]'::jsonb;
alter table public.promoter_links add column if not exists bar_commission_percent numeric(5,2) not null default 0 check (bar_commission_percent between 0 and 100);

-- [v1.5] Expulsados de un evento por el organizador: no pueden volver a entrar a ESE evento.
create table if not exists public.event_bans (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  banned_by   uuid references public.profiles(id) on delete set null,
  reason      text check (reason is null or char_length(reason) <= 140),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists idx_brands_owner            on public.brands (owner_id);
create index if not exists idx_events_brand            on public.events (brand_id) where brand_id is not null;
create index if not exists idx_orders_awaiting         on public.bar_orders (event_id) where payment_status = 'awaiting_payment';
create index if not exists idx_squad_expenses_squad    on public.squad_expenses (squad_id);
create index if not exists idx_squad_settlements_squad on public.squad_settlements (squad_id);


-- ════════════════════════════════════════════════════════════════════════
-- [v1.7] SEGURIDAD OPERATIVA: staff por organización, kiosco, auditoría, reportes
--   Organización = la cuenta del dueño/a (organization_id = su user id = events.created_by).
-- ════════════════════════════════════════════════════════════════════════
alter table public.events add column if not exists require_checkin_for_lobby boolean not null default false;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
-- Borrado de cuenta: los pedidos PAGADOS quedan anonimizados (user_id null) para la contabilidad de la barra.
alter table public.bar_orders alter column user_id drop not null;

-- Administradores globales de ROUGE (consola /superadmin). Se cargan a mano con service role.
create table if not exists public.platform_admins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Staff de la organización (alta por invitación). Alcance: todos los eventos de la organización o algunos.
create table if not exists public.staff_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.profiles(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             staff_role_t not null check (role::text <> 'owner'),
  scope            text not null check (scope in ('all_org_events','specific_events')),
  event_ids        uuid[] not null default '{}',
  access_window    boolean not null default true,
  revoked_at       timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint staff_assignment_scope_chk check (scope = 'all_org_events' or cardinality(event_ids) > 0)
);
create unique index if not exists uq_staff_assignment_active on public.staff_assignments (organization_id, user_id) where revoked_at is null;

-- Invitaciones de 1 uso (link/QR, 2 h). Solo el hash del token (el token vive en el link).
create table if not exists public.staff_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.profiles(id) on delete cascade,
  role             staff_role_t not null check (role::text <> 'owner'),
  scope            text not null check (scope in ('all_org_events','specific_events')),
  event_ids        uuid[] not null default '{}',
  access_window    boolean not null default true,
  token_hash       text not null unique,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  used_by          uuid references public.profiles(id) on delete set null,
  revoked_at       timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- PIN de terminal (Modo Kiosco): bcrypt; ningún cliente lo lee (RLS sin políticas, se verifica por RPC).
create table if not exists public.terminal_pins (
  organization_id  uuid not null references public.profiles(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  pin_hash         text not null,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Auditoría inmutable: sin UPDATE/DELETE (trigger), escrita por RPCs y triggers.
create table if not exists public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.profiles(id) on delete set null,
  event_id         uuid references public.events(id) on delete set null,
  actor_id         uuid references public.profiles(id) on delete set null,
  operator_id      uuid references public.profiles(id) on delete set null,
  action           text not null,
  target           text,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists idx_audit_org on public.audit_log (organization_id, created_at desc);
create index if not exists idx_audit_kiosk on public.audit_log (event_id, actor_id, created_at desc) where action = 'kiosk.failed';

-- Reportes de usuarios: alerta en vivo al panel de seguridad del evento.
create table if not exists public.user_reports (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid references public.events(id) on delete cascade,
  reporter_id       uuid not null references public.profiles(id) on delete cascade,
  reported_user_id  uuid not null references public.profiles(id) on delete cascade,
  reason            text not null check (reason in ('harassment','fake_profile','underage','violence','spam','other')),
  details           text not null default '' check (char_length(details) <= 280),
  status            text not null default 'open' check (status in ('open','reviewed')),
  reviewed_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id <> reported_user_id)
);
create unique index if not exists uq_report_open on public.user_reports (reporter_id, reported_user_id, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open';
create index if not exists idx_reports_event on public.user_reports (event_id, status, created_at desc);

-- Botón de Arrepentimiento (Res. 424/2020): pedidos de revocación, sin cuenta. Solo los lee el servidor.
create table if not exists public.withdrawal_requests (
  id           uuid primary key default gen_random_uuid(),
  tracking     text not null unique,
  email        text not null check (char_length(email) between 5 and 160),
  order_ref    text check (order_ref is null or char_length(order_ref) <= 80),
  reason       text check (reason is null or char_length(reason) <= 500),
  created_at   timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════════════════
-- [v1.7] QR DINÁMICOS, LISTAS FREE Y PUERTA SIN CONEXIÓN
-- ════════════════════════════════════════════════════════════════════════
-- Secreto de los QR TOTP de cada evento. Ningún cliente lo lee (RLS sin políticas): el asistente recibe solo el de SUS
-- credenciales (my_qr_secrets) y la puerta/barra el del evento (event_qr_secret) para validar sin conexión.
create table if not exists public.event_secrets (
  event_id   uuid primary key references public.events(id) on delete cascade,
  qr_secret  text not null default encode(gen_random_bytes(32), 'hex')
);

-- Listas / lotes: free hasta `free_until`; después se cobra `late_price` en la puerta (conversión tardía).
create table if not exists public.ticket_lists (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  free_until  timestamptz,
  late_price  numeric(12,2) not null default 0 check (late_price >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists idx_ticket_lists_event on public.ticket_lists (event_id);

alter table public.event_invite_codes add column if not exists list_id uuid references public.ticket_lists(id) on delete set null;
alter table public.event_invite_codes add column if not exists late_paid_at timestamptz;
alter table public.event_invite_codes add column if not exists late_payment_method text check (late_payment_method is null or late_payment_method in ('cash','mercadopago','transfer'));
alter table public.event_invite_codes add column if not exists holder_name text check (holder_name is null or char_length(holder_name) <= 80);
alter table public.event_invite_codes add column if not exists holder_dni text check (holder_dni is null or char_length(holder_dni) <= 20);
alter table public.event_invite_codes add column if not exists holder_email text check (holder_email is null or char_length(holder_email) <= 160);
alter table public.event_invite_codes add column if not exists checked_in_terminal text check (checked_in_terminal is null or char_length(checked_in_terminal) <= 40);
alter table public.event_attendees add column if not exists checked_in_terminal text check (checked_in_terminal is null or char_length(checked_in_terminal) <= 40);

-- [v1.7] Campañas por WhatsApp (sin API paga): se arman en el panel y se envían desde el WhatsApp del organizador
-- (wa.me). Acá solo queda qué campaña se armó y a quién ya se contactó.
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.profiles(id) on delete cascade,
  event_id         uuid references public.events(id) on delete set null,
  name             text not null check (char_length(name) between 1 and 60),
  segment          text not null check (segment in ('birthdays_week','vip_spenders','inactive_30d','rrpp_guests','all')),
  promoter_id      uuid references public.profiles(id) on delete set null,
  template         text not null check (char_length(template) between 1 and 600),
  benefit          text not null default '' check (char_length(benefit) <= 80),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create table if not exists public.campaign_contacts (
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  contacted_at  timestamptz not null default now(),
  contacted_by  uuid references public.profiles(id) on delete set null,
  primary key (campaign_id, user_id)
);

-- [v1.7] Monetización: trago regalado desde el chat y Mesa VIP dividida (una cuota por integrante del Squad).
create table if not exists public.vip_reservations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  squad_id      uuid not null references public.squads(id) on delete cascade,
  item_id       text not null,
  label         text not null,
  total_amount  numeric(12,2) not null check (total_amount >= 0),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.bar_orders add column if not exists gift_to uuid references public.profiles(id) on delete set null;
alter table public.bar_orders add column if not exists vip_reservation_id uuid references public.vip_reservations(id) on delete cascade;

-- [v1.8] Creador modular de eventos: módulos por evento (feature flags), ciclo de vida y autogestión por organización.
alter table public.events add column if not exists features jsonb;
alter table public.events add column if not exists lifecycle_status text not null default 'live' check (lifecycle_status in ('draft','presale','live','ended'));
create table if not exists public.organization_settings (
  organization_id           uuid primary key references public.profiles(id) on delete cascade,
  allow_owner_self_service  boolean not null default false,
  updated_at                timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ════════════════════════════════════════════════════════════════════════
create index if not exists idx_blocks_blocker        on public.user_blocks (blocker_id);
create index if not exists idx_blocks_user           on public.user_blocks (blocked_user_id) where blocked_user_id is not null;
create index if not exists idx_blocks_phone          on public.user_blocks (blocked_phone_normalized) where blocked_phone_normalized is not null;
create unique index if not exists uq_blocks_user     on public.user_blocks (blocker_id, blocked_user_id) where blocked_user_id is not null;
create unique index if not exists uq_blocks_phone    on public.user_blocks (blocker_id, blocked_phone_normalized) where blocked_phone_normalized is not null;
create index if not exists idx_profiles_genres       on public.profiles using gin (music_genres);

create index if not exists idx_events_lobby          on public.events (lobby_opens_at, lobby_expires_at);
create index if not exists idx_invite_codes_event    on public.event_invite_codes (event_id, is_used);
create index if not exists idx_attendees_user        on public.event_attendees (user_id);
create index if not exists idx_attendees_grid        on public.event_attendees (event_id, ghost_mode, last_active_at desc);
create index if not exists idx_attendees_spent       on public.event_attendees (event_id, total_spent desc);

create index if not exists idx_conn_receiver         on public.connections (receiver_id, status, event_id);
create index if not exists idx_conn_sender           on public.connections (sender_id, status, event_id);
-- Una sola solicitud pendiente por par/dirección y un solo rompehielos por par
create unique index if not exists uq_conn_pending    on public.connections (event_id, sender_id, receiver_id) where status = 'pending';
create unique index if not exists uq_conn_icebreaker on public.connections (event_id, sender_id, receiver_id) where type = 'icebreaker';

create index if not exists idx_squads_event          on public.squads (event_id);
create index if not exists idx_squad_members_user    on public.squad_members (user_id, status);

create index if not exists idx_pins_event_active     on public.map_pins (event_id, expires_at desc);
create index if not exists idx_pins_user             on public.map_pins (user_id, event_id);
create index if not exists idx_pins_shared           on public.map_pins using gin (shared_match_ids);

create index if not exists idx_msg_direct            on public.messages (connection_id, created_at) where connection_id is not null;
create index if not exists idx_msg_squad             on public.messages (squad_id, created_at) where squad_id is not null;

create index if not exists idx_blasts_event          on public.event_blasts (event_id, created_at desc);
create index if not exists idx_blast_deliv_user      on public.blast_deliveries (user_id, created_at desc);
create index if not exists idx_perks_user            on public.user_perks_qrs (user_id, event_id, status);
create unique index if not exists uq_perk_rule_user  on public.user_perks_qrs (user_id, source_ref_id) where source = 'perk_rule';
create index if not exists idx_orders_board          on public.bar_orders (event_id, status, created_at);
create index if not exists idx_orders_user           on public.bar_orders (user_id, event_id);
create index if not exists idx_songs_event           on public.song_requests (event_id);

-- ════════════════════════════════════════════════════════════════════════
-- HELPERS (security definer: evitan recursión de RLS)
-- ════════════════════════════════════════════════════════════════════════

-- Invisibilidad mutua: bloqueo por id o por coincidencia de teléfono, en cualquier dirección.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1
    from public.user_blocks ub
    left join public.profiles pa on pa.id = a
    left join public.profiles pb on pb.id = b
    where (ub.blocker_id = a and (ub.blocked_user_id = b or (pb.phone_normalized is not null and ub.blocked_phone_normalized = pb.phone_normalized)))
       or (ub.blocker_id = b and (ub.blocked_user_id = a or (pa.phone_normalized is not null and ub.blocked_phone_normalized = pa.phone_normalized)))
  );
$$;

create or replace function public.is_event_attendee(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.event_attendees where event_id = p_event and user_id = p_user);
$$;

-- [v1.7] Rol por asignación de la organización (espejo de staffRoleOf): alcance + no revocada + ventana horaria
-- (2 h antes del inicio a 1 h después del cierre) cuando access_window. El kill switch revoca en el acto.
create or replace function public.assigned_staff_role(p_event uuid, p_user uuid default auth.uid())
returns staff_role_t language sql stable security definer set search_path = public, extensions as $$
  select a.role from public.staff_assignments a join public.events e on e.id = p_event
  where a.user_id = p_user and a.revoked_at is null and a.organization_id = e.created_by
    and (a.scope = 'all_org_events' or p_event = any(a.event_ids))
    and (not a.access_window or now() between e.starts_at - interval '2 hours' and e.ends_at + interval '1 hour')
  order by a.created_at desc limit 1;
$$;

create or replace function public.is_event_staff(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  -- [v1.6] El RRPP NO es staff para ver datos (pines, squads, pedidos, perks): solo tiene su link y sus números.
  select exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user and role::text <> 'promoter')
      or exists (select 1 from public.events where id = p_event and created_by = p_user)
      or coalesce(public.assigned_staff_role(p_event, p_user)::text, 'promoter') <> 'promoter';
$$;

-- Permisos por rol (espejo de src/lib/engine/roles.ts). Quien creó el evento es 'owner' aunque no tenga fila.
create or replace function public.has_staff_role(p_event uuid, p_roles staff_role_t[], p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user and role = any(p_roles))
      or ('owner' = any(p_roles) and exists (select 1 from public.events where id = p_event and created_by = p_user))
      or (not exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user)
          and public.assigned_staff_role(p_event, p_user) = any(p_roles));
$$;

-- [v1.7] Administración global de ROUGE.
create or replace function public.is_platform_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.platform_admins where user_id = p_user);
$$;

-- [v1.8] Módulo activo en el evento (espejo de resolveFeatures en engine/features.ts): sin configuración = todo prendido;
-- un flag con una dependencia apagada queda apagado.
create or replace function public.event_feature(p_event uuid, p_flag text)
returns boolean language plpgsql stable security definer set search_path = public, extensions as $$
declare f jsonb;
begin
  select features into f from public.events where id = p_event;
  if f is null then return true; end if;
  if coalesce((f->>p_flag)::boolean, true) is not true then return false; end if;
  return case p_flag
    when 'enableFreeCutoffConversion' then public.event_feature(p_event, 'enableTicketing')
    when 'enableSquadBillSplit' then public.event_feature(p_event, 'enableSquads')
    when 'enableChatDrinkGifting' then public.event_feature(p_event, 'enableSmartBar') and public.event_feature(p_event, 'enableDirectChat')
    else true end;
end $$;

-- [v1.8] ¿Quién configura eventos y módulos de una organización? ROUGE HQ o el dueño/a con autogestión.
create or replace function public.can_manage_modules(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_platform_admin()
      or (p_org = auth.uid() and exists (select 1 from public.organization_settings o where o.organization_id = p_org and o.allow_owner_self_service));
$$;
-- Dueño/a y producción: eventos, accesos, CRM, blasts, perks, sorteos y menú.
create or replace function public.is_event_manager(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.has_staff_role(p_event, array['owner','manager']::staff_role_t[], p_user);
$$;
-- Quien opera comandas: dueño/a, producción, barra y mozos.
create or replace function public.can_operate_bar(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.has_staff_role(p_event, array['owner','manager','bartender','waiter']::staff_role_t[], p_user);
$$;

create or replace function public.is_squad_member(p_squad uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.squad_members where squad_id = p_squad and user_id = p_user and status = 'joined');
$$;

create or replace function public.user_squad(p_event uuid, p_user uuid)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select sm.squad_id from public.squad_members sm
  join public.squads s on s.id = sm.squad_id
  where s.event_id = p_event and sm.user_id = p_user and sm.status = 'joined'
  limit 1;
$$;

-- [v1.4] ¿Comparto un Squad con esta persona? (alias para cobrar en las cuentas de la mesa)
create or replace function public.shares_squad(p_other uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.squad_members a join public.squad_members b on b.squad_id = a.squad_id
    where a.user_id = auth.uid() and b.user_id = p_other and a.status = 'joined' and b.status = 'joined');
$$;

create or replace function public.are_squadmates(p_event uuid, a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.user_squad(p_event, a) is not null and public.user_squad(p_event, a) = public.user_squad(p_event, b);
$$;

create or replace function public.is_match(p_event uuid, a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted' and (p_event is null or event_id = p_event)
      and ((sender_id = a and receiver_id = b) or (sender_id = b and receiver_id = a))
  );
$$;

create or replace function public.squad_event(p_squad uuid)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select event_id from public.squads where id = p_squad;
$$;

create or replace function public.lobby_is_open(p_event uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.events where id = p_event and now() >= lobby_opens_at and now() < lobby_expires_at);
$$;

-- Regla de visibilidad de pines (sin difusión implícita a matches).
create or replace function public.can_see_pin(p public.map_pins, viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select p.expires_at > now() and (
    p.user_id = viewer or (
      not public.is_blocked(viewer, p.user_id) and (
        (p.share_with_squad and public.are_squadmates(p.event_id, viewer, p.user_id)) or
        (viewer = any(p.shared_match_ids) and public.is_match(p.event_id, viewer, p.user_id))
      )
    )
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════
alter table public.profiles            enable row level security;
alter table public.instagram_accounts  enable row level security;
alter table public.api_keys            enable row level security;
alter table public.user_blocks         enable row level security;
alter table public.events              enable row level security;
alter table public.event_staff         enable row level security;
alter table public.event_invite_codes  enable row level security;
alter table public.event_attendees     enable row level security;
alter table public.connections         enable row level security;
alter table public.squads              enable row level security;
alter table public.squad_members       enable row level security;
alter table public.map_pins            enable row level security;
alter table public.messages            enable row level security;
alter table public.event_blasts        enable row level security;
alter table public.blast_deliveries    enable row level security;
alter table public.user_perks_qrs      enable row level security;
alter table public.perk_rules          enable row level security;
alter table public.raffles             enable row level security;
alter table public.song_requests       enable row level security;
alter table public.bar_menu_items      enable row level security;
alter table public.bar_orders          enable row level security;
alter table public.brands              enable row level security;
alter table public.brand_payment_accounts enable row level security;
alter table public.squad_expenses      enable row level security;
alter table public.squad_settlements   enable row level security;
alter table public.payout_aliases      enable row level security;
alter table public.event_bans          enable row level security;
alter table public.promoter_links      enable row level security;

-- PROFILES ── el teléfono NUNCA es legible por otros usuarios (column privileges).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_blocked(auth.uid(), id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select (id, username, full_name, birth_date, gender, bio, photos, loop_video_url, music_genres, spotify_embed_url, instagram_username, instagram_verified, is_verified, created_at)
  on public.profiles to authenticated;
-- is_verified solo lo modifica el staff de ROUGE (service role); instagram_verified lo calcula el trigger
grant insert (id, username, full_name, birth_date, gender, phone_normalized, bio, photos, loop_video_url, music_genres, spotify_embed_url, instagram_username, terms_accepted_at)
  on public.profiles to authenticated;
grant update (username, full_name, birth_date, gender, phone_normalized, bio, photos, loop_video_url, music_genres, spotify_embed_url, instagram_username, terms_accepted_at)
  on public.profiles to authenticated;

-- Instagram verificado ⇔ el @ del perfil es el de la cuenta conectada (espejo de upsertProfile en el motor).
create or replace function public.tg_profile_instagram()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' and new.instagram_username is null then
    -- Login con Instagram antes del onboarding: el perfil nace con el @ de la cuenta conectada.
    select lower(username) into new.instagram_username from public.instagram_accounts where user_id = new.id;
  end if;
  new.instagram_username := nullif(lower(new.instagram_username), '');
  new.instagram_verified := new.instagram_username is not null and exists (
    select 1 from public.instagram_accounts a where a.user_id = new.id and lower(a.username) = new.instagram_username);
  return new;
end $$;
drop trigger if exists profile_instagram on public.profiles;
create trigger profile_instagram before insert or update on public.profiles
  for each row execute function public.tg_profile_instagram();

-- INSTAGRAM ── ningún cliente ve los tokens; mi conexión (sin token) se lee con my_instagram().
revoke all on public.instagram_accounts from anon, authenticated;
create or replace function public.my_instagram()
returns table (username text, account_type text, connected_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.username, a.account_type, a.connected_at from public.instagram_accounts a where a.user_id = auth.uid();
$$;

-- Mi perfil completo (incluye mi teléfono)
create or replace function public.my_profile()
returns setof public.profiles language sql stable security definer set search_path = public, extensions as $$
  select * from public.profiles where id = auth.uid();
$$;

-- USER_BLOCKS ── solo veo y gestiono mi lista negra.
drop policy if exists blocks_own on public.user_blocks;
create policy blocks_own on public.user_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- EVENTS ── públicos para la landing de /join; escritura solo staff.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to anon, authenticated using (true);
drop policy if exists events_insert on public.events;
-- [v1.8] Alta directa solo con autogestión (ROUGE HQ crea para cualquier organización con builder_save_event).
create policy events_insert on public.events for insert to authenticated with check (created_by = auth.uid() and public.can_manage_modules(auth.uid()));
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated using (public.is_event_manager(id)) with check (public.is_event_manager(id));
-- El código maestro no se expone a anónimos (la landing /join solo necesita datos públicos)
revoke all on public.events from anon;
grant select (id, slug, name, description, venue_name, cover_url, starts_at, ends_at, lobby_opens_at, lobby_expires_at, max_capacity,
              brand_id, logo_url, theme_primary, theme_accent)
  on public.events to anon;

-- [v1.5] Eliminar un evento: solo quien lo creó (y nunca con cobros registrados: trigger events_keep_payments).
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated using (created_by = auth.uid());

-- PROMOTER LINKS ── el RRPP ve el suyo; dueño/a y producción, todos. Altas y comisión por RPC.
drop policy if exists promoter_links_select on public.promoter_links;
create policy promoter_links_select on public.promoter_links for select to authenticated using (user_id = auth.uid() or public.is_event_manager(event_id));

-- EVENT BANS ── el staff gestor ve y levanta los bloqueos de su evento; cada uno ve el propio. Altas por remove_attendee.
drop policy if exists bans_select on public.event_bans;
create policy bans_select on public.event_bans for select to authenticated using (user_id = auth.uid() or public.is_event_manager(event_id));
drop policy if exists bans_delete on public.event_bans;
create policy bans_delete on public.event_bans for delete to authenticated using (public.is_event_manager(event_id));

-- BRANDS ── públicas (la app y /join muestran logo y colores); cada dueño/a edita las suyas.
-- payments_enabled no es editable por clientes (column privileges): lo escribe el servidor al conectar Mercado Pago.
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands for select to anon, authenticated using (true);
drop policy if exists brands_insert on public.brands;
create policy brands_insert on public.brands for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists brands_update on public.brands;
create policy brands_update on public.brands for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.brands from anon, authenticated;
grant select on public.brands to anon, authenticated;
grant insert (id, owner_id, name, logo_url, primary_color, accent_color) on public.brands to authenticated;
grant update (name, logo_url, primary_color, accent_color) on public.brands to authenticated;

-- BRAND PAYMENT ACCOUNTS ── ningún cliente ve los tokens; el estado (sin tokens) se lee con my_brand_payments().
revoke all on public.brand_payment_accounts from anon, authenticated;

drop policy if exists staff_select on public.event_staff;
create policy staff_select on public.event_staff for select to authenticated using (user_id = auth.uid() or public.is_event_staff(event_id));
drop policy if exists staff_manage on public.event_staff;
create policy staff_manage on public.event_staff for all to authenticated
  using (public.has_staff_role(event_id, array['owner']::staff_role_t[]))
  with check (public.has_staff_role(event_id, array['owner']::staff_role_t[]));

-- API KEYS ── cada quien ve sus claves (nunca el hash); se crean y revocan por RPC.
revoke all on public.api_keys from anon, authenticated;
grant select (id, name, prefix, created_by, event_id, scopes, last_used_at, revoked_at, created_at) on public.api_keys to authenticated;
drop policy if exists api_keys_own on public.api_keys;
create policy api_keys_own on public.api_keys for select to authenticated using (created_by = auth.uid());

-- INVITE CODES ── solo staff (el canje va por la RPC join_event).
drop policy if exists codes_staff on public.event_invite_codes;
create policy codes_staff on public.event_invite_codes for all to authenticated
  using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));

-- ATTENDEES ── veo a los asistentes de mis eventos sin bloqueo; ghost solo para mí, mi squad y mis matches.
drop policy if exists attendees_select on public.event_attendees;
create policy attendees_select on public.event_attendees for select to authenticated using (
  user_id = auth.uid()
  or public.is_event_staff(event_id)
  or (
    public.is_event_attendee(event_id)
    and not public.is_blocked(auth.uid(), user_id)
    and (not ghost_mode or public.are_squadmates(event_id, auth.uid(), user_id) or public.is_match(event_id, auth.uid(), user_id))
    -- [v1.7] Privacidad: con require_checkin_for_lobby, solo quien ya ingresó por la puerta (o tu Squad/matches).
    and (checked_in_at is not null
         or not exists (select 1 from public.events e where e.id = event_id and e.require_checkin_for_lobby)
         or public.are_squadmates(event_id, auth.uid(), user_id) or public.is_match(event_id, auth.uid(), user_id))
  )
);
drop policy if exists attendees_update_self on public.event_attendees;
create policy attendees_update_self on public.event_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.event_attendees from authenticated;
grant update (mood_tag, ghost_mode, only_liked_can_icebreak, last_active_at) on public.event_attendees to authenticated;

-- CONNECTIONS ── las ven emisor y receptor; altas vía RPC; el receptor responde.
drop policy if exists conn_select on public.connections;
create policy conn_select on public.connections for select to authenticated
  using ((sender_id = auth.uid() or receiver_id = auth.uid()) and not public.is_blocked(sender_id, receiver_id));
drop policy if exists conn_respond on public.connections;
create policy conn_respond on public.connections for update to authenticated
  using (receiver_id = auth.uid() and status = 'pending')
  with check (receiver_id = auth.uid());
revoke update on public.connections from authenticated;
grant update (status, responded_at) on public.connections to authenticated;

-- SQUADS ── los ven sus miembros/invitados; los que comparten Mesa VIP, todo el evento.
drop policy if exists squads_select on public.squads;
create policy squads_select on public.squads for select to authenticated using (
  exists (select 1 from public.squad_members m where m.squad_id = squads.id and m.user_id = auth.uid())
  or (has_vip_table_to_share and public.is_event_attendee(event_id))
  or public.is_event_staff(event_id)
);
drop policy if exists squads_update on public.squads;
create policy squads_update on public.squads for update to authenticated
  using (public.is_squad_member(id)) with check (public.is_squad_member(id));

drop policy if exists squad_members_select on public.squad_members;
create policy squad_members_select on public.squad_members for select to authenticated
  using (user_id = auth.uid() or public.is_squad_member(squad_id) or public.is_event_staff(public.squad_event(squad_id)));
drop policy if exists squad_members_leave on public.squad_members;
create policy squad_members_leave on public.squad_members for delete to authenticated using (user_id = auth.uid());

-- MAP PINS ── visibilidad por can_see_pin(); cada uno gestiona su pin.
drop policy if exists pins_select on public.map_pins;
create policy pins_select on public.map_pins for select to authenticated
  using (public.can_see_pin(map_pins) or public.is_event_staff(event_id));
drop policy if exists pins_insert on public.map_pins;
create policy pins_insert on public.map_pins for insert to authenticated with check (
  user_id = auth.uid() and public.is_event_attendee(event_id) and public.lobby_is_open(event_id)
  and expires_at <= now() + interval '15 minutes 5 seconds'
);
drop policy if exists pins_delete on public.map_pins;
create policy pins_delete on public.map_pins for delete to authenticated using (user_id = auth.uid());

-- MESSAGES ── chats 1:1 solo entre matches; chat de squad solo miembros.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  (conversation_type = 'direct' and exists (
    select 1 from public.connections c
    where c.id = connection_id and c.status = 'accepted'
      and (c.sender_id = auth.uid() or c.receiver_id = auth.uid())
      and not public.is_blocked(c.sender_id, c.receiver_id)))
  or (conversation_type = 'squad' and public.is_squad_member(squad_id))
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and message_type <> 'system_alert' and (
    (conversation_type = 'direct' and exists (
      select 1 from public.connections c
      where c.id = connection_id and c.event_id = messages.event_id and c.status = 'accepted'
        and (c.sender_id = auth.uid() or c.receiver_id = auth.uid())
        and not public.is_blocked(c.sender_id, c.receiver_id)
        and public.event_feature(c.event_id, 'enableDirectChat')))
    or (conversation_type = 'squad' and public.is_squad_member(squad_id) and public.event_feature(public.squad_event(squad_id), 'enableSquads'))
  )
);

-- BLASTS ── recibo solo los que me fueron entregados.
drop policy if exists blasts_select on public.event_blasts;
create policy blasts_select on public.event_blasts for select to authenticated using (
  public.is_event_staff(event_id)
  or exists (select 1 from public.blast_deliveries d where d.blast_id = event_blasts.id and d.user_id = auth.uid())
);
drop policy if exists deliveries_own on public.blast_deliveries;
create policy deliveries_own on public.blast_deliveries for select to authenticated using (user_id = auth.uid());
drop policy if exists deliveries_seen on public.blast_deliveries;
create policy deliveries_seen on public.blast_deliveries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- PERKS ── mis QRs; el staff los ve y los canjea.
drop policy if exists perks_select on public.user_perks_qrs;
create policy perks_select on public.user_perks_qrs for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id));
drop policy if exists perks_staff_update on public.user_perks_qrs;
create policy perks_staff_update on public.user_perks_qrs for update to authenticated
  using (public.has_staff_role(event_id, array['owner','manager','bartender']::staff_role_t[]))
  with check (public.has_staff_role(event_id, array['owner','manager','bartender']::staff_role_t[]));

drop policy if exists perk_rules_staff on public.perk_rules;
create policy perk_rules_staff on public.perk_rules for all to authenticated
  using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));
drop policy if exists perk_rules_staff_read on public.perk_rules;
create policy perk_rules_staff_read on public.perk_rules for select to authenticated using (public.is_event_staff(event_id));
-- Los asistentes ven las reglas activas de su evento (progreso "Squad de 4 → trago").
drop policy if exists perk_rules_attendees on public.perk_rules;
create policy perk_rules_attendees on public.perk_rules for select to authenticated
  using (is_active and public.is_event_attendee(event_id));

drop policy if exists raffles_select on public.raffles;
create policy raffles_select on public.raffles for select to authenticated
  using (public.is_event_attendee(event_id) or public.is_event_staff(event_id));
drop policy if exists raffles_staff on public.raffles;
create policy raffles_staff on public.raffles for insert to authenticated with check (public.is_event_manager(event_id));

drop policy if exists songs_select on public.song_requests;
create policy songs_select on public.song_requests for select to authenticated
  using (public.is_event_attendee(event_id) or public.is_event_staff(event_id));

drop policy if exists menu_select on public.bar_menu_items;
create policy menu_select on public.bar_menu_items for select to authenticated using (true);
drop policy if exists menu_staff on public.bar_menu_items;
create policy menu_staff on public.bar_menu_items for all to authenticated
  using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));

drop policy if exists orders_select on public.bar_orders;
create policy orders_select on public.bar_orders for select to authenticated
  using (user_id = auth.uid() or auth.uid() = any(split_user_ids) or public.is_event_staff(event_id));
drop policy if exists orders_staff_update on public.bar_orders;
create policy orders_staff_update on public.bar_orders for update to authenticated
  using (public.can_operate_bar(event_id)) with check (public.can_operate_bar(event_id));
-- [v1.4] El estado de pago lo escribe solo el servidor (confirm_order_payment): el staff solo cambia `status`.
revoke update on public.bar_orders from anon, authenticated;
grant update (status, updated_at) on public.bar_orders to authenticated;

-- CUENTAS DE LA MESA ── las ven los integrantes del Squad; altas por RPC (validan montos e integrantes).
drop policy if exists expenses_select on public.squad_expenses;
create policy expenses_select on public.squad_expenses for select to authenticated using (public.is_squad_member(squad_id));
drop policy if exists expenses_delete on public.squad_expenses;
create policy expenses_delete on public.squad_expenses for delete to authenticated using (paid_by = auth.uid());
drop policy if exists settlements_select on public.squad_settlements;
create policy settlements_select on public.squad_settlements for select to authenticated using (public.is_squad_member(squad_id));

-- ALIAS PARA COBRAR ── el mío lo gestiono yo; el de otros solo si compartimos un Squad.
drop policy if exists payout_own on public.payout_aliases;
create policy payout_own on public.payout_aliases for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists payout_squad on public.payout_aliases;
create policy payout_squad on public.payout_aliases for select to authenticated using (public.shares_squad(user_id));

-- ════════════════════════════════════════════════════════════════════════
-- RPCs DE NEGOCIO (atómicas; replican src/lib/engine/actions.ts)
-- ════════════════════════════════════════════════════════════════════════

-- Grilla: asistentes visibles + afinidad musical (Dice) + rank + zonas en común.
drop function if exists public.event_grid(uuid);
create or replace function public.event_grid(p_event uuid)
returns table (
  user_id uuid, username citext, full_name text, birth_date date, gender gender_t, bio text, photos jsonb,
  loop_video_url text, music_genres text[], spotify_embed_url text, is_verified boolean,
  mood_tag mood_tag_t, last_active_at timestamptz, music_affinity int, rank numeric, shared_zones text[]
) language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select p.music_genres, a.mood_tag, a.visited_sectors from public.profiles p
    join public.event_attendees a on a.user_id = p.id and a.event_id = p_event
    where p.id = auth.uid()
  )
  select p.id, p.username, p.full_name, p.birth_date, p.gender, p.bio, p.photos, p.loop_video_url, p.music_genres,
         p.spotify_embed_url, p.is_verified, a.mood_tag, a.last_active_at,
         round(100 * coalesce(2.0 * cardinality(array(select unnest(p.music_genres) intersect select unnest(me.music_genres)))
           / nullif(cardinality(p.music_genres) + cardinality(me.music_genres), 0), 0))::int as music_affinity,
         round((
           0.60 * coalesce(2.0 * cardinality(array(select unnest(p.music_genres) intersect select unnest(me.music_genres)))
             / nullif(cardinality(p.music_genres) + cardinality(me.music_genres), 0), 0)
         + 0.25 * case when a.mood_tag = me.mood_tag then 0.8 when a.mood_tag in ('open_to_meet','at_bar','after_hunt') and me.mood_tag in ('open_to_meet','at_bar','after_hunt') then 0.7 else 0.4 end
         + 0.15 * greatest(0, 1 - extract(epoch from now() - a.last_active_at) / 5400)
         )::numeric, 4) as rank,
         array(select unnest(a.visited_sectors) intersect select unnest(me.visited_sectors)) as shared_zones
  from public.event_attendees a
  join public.profiles p on p.id = a.user_id
  cross join me
  where a.event_id = p_event and a.user_id <> auth.uid() and not a.ghost_mode
    and not public.is_blocked(auth.uid(), a.user_id)
    and public.lobby_is_open(p_event)
    and not exists (select 1 from public.connections c where c.event_id = p_event and c.status = 'rejected'
                    and ((c.sender_id = auth.uid() and c.receiver_id = a.user_id) or (c.sender_id = a.user_id and c.receiver_id = auth.uid())))
  order by rank desc;
$$;

-- Ingreso por Link Maestro, Código Único de 1 uso o link de Squad.
create or replace function public.join_event(p_code text, p_mood mood_tag_t)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_code public.event_invite_codes;
  v_squad public.squads;
  v_link public.promoter_links;
  v_via join_via_t;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event from public.events where upper(master_invite_code) = upper(p_code) or slug = lower(p_code);
  if found then v_via := 'master_link';
  elsif exists (select 1 from public.promoter_links where upper(code) = upper(trim(p_code))) then
    -- [v1.6] Link de RRPP: entra como el link maestro y queda atribuido a ese RRPP.
    select * into v_link from public.promoter_links where upper(code) = upper(trim(p_code));
    select * into v_event from public.events where id = v_link.event_id;
    v_via := 'master_link';
  else
    select * into v_code from public.event_invite_codes where upper(code) = upper(p_code) and revoked_at is null for update;
    if found then
      select * into v_event from public.events where id = v_code.event_id;
      v_via := 'single_use_code';
    else
      select * into v_squad from public.squads where upper(invite_code) = upper(p_code);
      if not found then raise exception 'invalid_code'; end if;
      select * into v_event from public.events where id = v_squad.event_id;
      v_via := 'squad_link';
    end if;
  end if;

  if now() < v_event.lobby_opens_at then raise exception 'lobby_not_open'; end if;
  if now() >= v_event.lobby_expires_at then raise exception 'lobby_expired'; end if;
  -- [v1.5] Expulsado por el organizador (mensaje genérico, igual que joinEvent del motor).
  if exists (select 1 from public.event_bans where event_id = v_event.id and user_id = v_uid) then raise exception 'banned'; end if;
  -- [v1.8] Borrador: no se puede entrar. Con la ticketera apagada, los códigos de 1 uso no sirven.
  if v_event.lifecycle_status = 'draft' then raise exception 'event_draft'; end if;
  if v_via = 'single_use_code' and not public.event_feature(v_event.id, 'enableTicketing') then raise exception 'feature_disabled'; end if;

  if exists (select 1 from public.event_attendees where event_id = v_event.id and user_id = v_uid) then
    update public.event_attendees set mood_tag = p_mood, last_active_at = now() where event_id = v_event.id and user_id = v_uid;
  else
    if v_via = 'single_use_code' then
      if v_code.is_used and v_code.used_by_user_id is distinct from v_uid then raise exception 'code_already_used'; end if;
      update public.event_invite_codes set is_used = true, used_by_user_id = v_uid, used_at = now() where id = v_code.id;
    elsif (select count(*) from public.event_attendees where event_id = v_event.id) >= v_event.max_capacity then
      raise exception 'event_full';
    end if;
    insert into public.event_attendees (event_id, user_id, mood_tag, joined_via, referred_by)
    values (v_event.id, v_uid, p_mood, v_via, case when v_link.user_id is distinct from v_uid then v_link.user_id end);
  end if;

  if v_via = 'squad_link' and public.user_squad(v_event.id, v_uid) is null
     and not exists (select 1 from public.squad_members m where m.squad_id = v_squad.id and public.is_blocked(m.user_id, v_uid)) then
    insert into public.squad_members (squad_id, user_id, status, joined_at) values (v_squad.id, v_uid, 'joined', now())
    on conflict (squad_id, user_id) do update set status = 'joined', joined_at = now();
  end if;

  return v_event.id;
end $$;

-- Vista previa de un link/código de acceso (también sin sesión). Los squads y los códigos de 1 uso
-- no son legibles por RLS, así que /join/<código> se resuelve acá devolviendo SOLO datos públicos.
create or replace function public.resolve_access_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_event public.events; v_code public.event_invite_codes; v_squad public.squads; v_via text;
begin
  select * into v_event from public.events where upper(master_invite_code) = upper(trim(p_code)) or slug = lower(trim(p_code));
  if found then v_via := 'master_link';
  elsif exists (select 1 from public.promoter_links where upper(code) = upper(trim(p_code))) then
    select e.* into v_event from public.events e join public.promoter_links l on l.event_id = e.id where upper(l.code) = upper(trim(p_code));
    v_via := 'master_link';
  else
    select * into v_code from public.event_invite_codes where upper(code) = upper(trim(p_code)) and revoked_at is null;
    if found then
      select * into v_event from public.events where id = v_code.event_id;
      v_via := 'single_use_code';
    else
      select * into v_squad from public.squads where upper(invite_code) = upper(trim(p_code));
      if not found then return null; end if;
      select * into v_event from public.events where id = v_squad.event_id;
      v_via := 'squad_link';
    end if;
  end if;
  return jsonb_build_object(
    'via', v_via,
    'event', jsonb_build_object(
      'id', v_event.id, 'slug', v_event.slug, 'name', v_event.name, 'description', v_event.description,
      'venue_name', v_event.venue_name, 'cover_url', v_event.cover_url, 'lineup_json', v_event.lineup_json,
      'venue_layout_json', v_event.venue_layout_json, 'starts_at', v_event.starts_at, 'ends_at', v_event.ends_at,
      'lobby_opens_at', v_event.lobby_opens_at, 'lobby_expires_at', v_event.lobby_expires_at, 'max_capacity', v_event.max_capacity,
      'brand_id', v_event.brand_id, 'logo_url', v_event.logo_url, 'theme_primary', v_event.theme_primary, 'theme_accent', v_event.theme_accent),
    'brand', (select jsonb_build_object('id', b.id, 'name', b.name, 'logo_url', b.logo_url, 'primary_color', b.primary_color, 'accent_color', b.accent_color)
              from public.brands b where b.id = v_event.brand_id),
    'attendees', (select count(*) from public.event_attendees where event_id = v_event.id),
    'code_used_by_other', coalesce(v_code.is_used, false) and v_code.used_by_user_id is distinct from auth.uid(),
    'squad', case when v_squad.id is null then null else jsonb_build_object(
      'id', v_squad.id, 'name', v_squad.name,
      'members', (select count(*) from public.squad_members where squad_id = v_squad.id and status = 'joined'),
      'creator_first_name', (select split_part(full_name, ' ', 1) from public.profiles where id = v_squad.created_by)) end
  );
end $$;

-- Conectar: crea solicitud o, si había una recíproca pendiente, la convierte en match.
create or replace function public.send_connection(p_event uuid, p_receiver uuid)
returns public.connections language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_reciprocal public.connections;
  v_row public.connections;
begin
  if not public.lobby_is_open(p_event) then raise exception 'lobby_closed'; end if;
  if not public.event_feature(p_event, 'enableSocialLobby') then raise exception 'feature_disabled'; end if;
  if not public.is_event_attendee(p_event, v_uid) or not public.is_event_attendee(p_event, p_receiver) then raise exception 'not_attendee'; end if;
  if public.is_blocked(v_uid, p_receiver) then raise exception 'unavailable'; end if;
  if exists (select 1 from public.event_attendees where event_id = p_event and user_id = v_uid and ghost_mode) then raise exception 'sender_in_ghost_mode'; end if;
  if public.is_match(p_event, v_uid, p_receiver) then raise exception 'already_matched'; end if;

  select * into v_reciprocal from public.connections
   where event_id = p_event and sender_id = p_receiver and receiver_id = v_uid and status = 'pending' for update;
  if found then
    update public.connections set status = 'accepted', responded_at = now() where id = v_reciprocal.id returning * into v_row;
    return v_row;
  end if;

  if exists (select 1 from public.event_attendees where event_id = p_event and user_id = p_receiver and ghost_mode) then raise exception 'unavailable'; end if;
  insert into public.connections (event_id, sender_id, receiver_id, type) values (p_event, v_uid, p_receiver, 'regular') returning * into v_row;
  return v_row;
end $$;

-- Rompehielos: 1 bala por evento, respeta "solo de quien conecté primero".
create or replace function public.send_icebreaker(p_event uuid, p_receiver uuid, p_message text, p_gift_item text default null)
returns public.connections language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_att public.event_attendees;
  v_rcv public.event_attendees;
  v_item public.bar_menu_items;
  v_order_id uuid;
  v_perk_id uuid;
  v_row public.connections;
begin
  if not public.lobby_is_open(p_event) then raise exception 'lobby_closed'; end if;
  if not public.event_feature(p_event, 'enableSocialLobby') then raise exception 'feature_disabled'; end if;
  select * into v_att from public.event_attendees where event_id = p_event and user_id = v_uid for update;
  select * into v_rcv from public.event_attendees where event_id = p_event and user_id = p_receiver;
  if v_att.id is null or v_rcv.id is null or public.is_blocked(v_uid, p_receiver) or v_rcv.ghost_mode then raise exception 'unavailable'; end if;
  if v_att.ghost_mode then raise exception 'sender_in_ghost_mode'; end if;
  if v_att.icebreaker_used then raise exception 'icebreaker_already_used'; end if;
  if coalesce(trim(p_message), '') = '' or char_length(p_message) > 140 then raise exception 'invalid_message'; end if;
  if public.is_match(p_event, v_uid, p_receiver) then raise exception 'already_matched'; end if;
  if v_rcv.only_liked_can_icebreak and not exists (
    select 1 from public.connections where event_id = p_event and sender_id = p_receiver and receiver_id = v_uid
  ) then raise exception 'receiver_only_accepts_liked'; end if;

  if p_gift_item is not null then
    if not public.event_feature(p_event, 'enableSmartBar') then raise exception 'feature_disabled'; end if;
    select * into v_item from public.bar_menu_items where event_id = p_event and id = p_gift_item and is_available
      and category in ('trago','cerveza','sin_alcohol');
    if not found then raise exception 'invalid_item'; end if;
    insert into public.bar_orders (event_id, user_id, delivery_type, items_json, total_amount)
      values (p_event, v_uid, 'icebreaker_gift',
              jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'name', v_item.emoji || ' ' || v_item.name, 'qty', 1, 'unit_price', v_item.price)),
              v_item.price)
      returning id into v_order_id;
    insert into public.user_perks_qrs (event_id, user_id, title, perk_type, source, source_ref_id)
      values (p_event, p_receiver, v_item.emoji || ' ' || v_item.name || ' — regalo Rompehielos', 'gifted_drink', 'icebreaker_gift', v_order_id)
      returning id into v_perk_id;
    update public.event_attendees set total_spent = total_spent + v_item.price where id = v_att.id;
  end if;

  delete from public.connections where event_id = p_event and sender_id = v_uid and receiver_id = p_receiver and status = 'pending';
  insert into public.connections (event_id, sender_id, receiver_id, type, icebreaker_message, attached_drink_qr_id)
    values (p_event, v_uid, p_receiver, 'icebreaker', trim(p_message), v_perk_id) returning * into v_row;
  update public.event_attendees set icebreaker_used = true, last_active_at = now() where id = v_att.id;
  return v_row;
end $$;

-- Al aceptar un rompehielos, su texto pasa a ser el primer mensaje del chat.
create or replace function public.tg_connection_accepted()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'accepted' and old.status = 'pending' and new.type = 'icebreaker' and new.icebreaker_message is not null then
    insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content, created_at)
    values (new.event_id, 'direct', new.id, new.sender_id, 'text', new.icebreaker_message, new.created_at);
  end if;
  return new;
end $$;
drop trigger if exists connection_accepted on public.connections;
create trigger connection_accepted after update of status on public.connections
  for each row execute function public.tg_connection_accepted();

-- Squads
create or replace function public.create_squad(p_event uuid, p_name text)
returns public.squads language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.squads;
begin
  if not public.lobby_is_open(p_event) or not public.is_event_attendee(p_event) then raise exception 'not_allowed'; end if;
  if not public.event_feature(p_event, 'enableSquads') then raise exception 'feature_disabled'; end if;
  if public.user_squad(p_event, auth.uid()) is not null then raise exception 'already_in_squad'; end if;
  insert into public.squads (event_id, name, created_by) values (p_event, coalesce(nullif(trim(p_name), ''), 'Mi Squad'), auth.uid()) returning * into v_row;
  insert into public.squad_members (squad_id, user_id, status, joined_at) values (v_row.id, auth.uid(), 'joined', now());
  return v_row;
end $$;

create or replace function public.invite_to_squad(p_squad uuid, p_invitee uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_event uuid;
begin
  select event_id into v_event from public.squads where id = p_squad;
  if not public.is_squad_member(p_squad) then raise exception 'not_member'; end if;
  if not public.is_event_attendee(v_event, p_invitee) then raise exception 'not_attendee'; end if;
  if exists (select 1 from public.squad_members m where m.squad_id = p_squad and public.is_blocked(m.user_id, p_invitee)) then raise exception 'unavailable'; end if;
  if public.user_squad(v_event, p_invitee) is not null then raise exception 'already_in_squad'; end if;
  insert into public.squad_members (squad_id, user_id, invited_by, status) values (p_squad, p_invitee, auth.uid(), 'invited')
  on conflict (squad_id, user_id) do nothing;
end $$;

create or replace function public.join_squad(p_squad uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_event uuid; v_name text;
begin
  select event_id into v_event from public.squads where id = p_squad;
  if v_event is null or not public.lobby_is_open(v_event) or not public.is_event_attendee(v_event) then raise exception 'not_allowed'; end if;
  if public.user_squad(v_event, auth.uid()) is not null then raise exception 'already_in_squad'; end if;
  if exists (select 1 from public.squad_members m where m.squad_id = p_squad and m.status = 'joined' and public.is_blocked(m.user_id, auth.uid())) then raise exception 'unavailable'; end if;
  insert into public.squad_members (squad_id, user_id, status, joined_at) values (p_squad, auth.uid(), 'joined', now())
  on conflict (squad_id, user_id) do update set status = 'joined', joined_at = now();
  select split_part(full_name, ' ', 1) into v_name from public.profiles where id = auth.uid();
  insert into public.messages (event_id, conversation_type, squad_id, sender_id, message_type, content)
  values (v_event, 'squad', p_squad, auth.uid(), 'system_alert', '👋 ' || v_name || ' se sumó al Squad');
end $$;

-- QR Drops automáticos: "Squad de N miembros antes de HH:MM" → 1 QR por integrante (idempotente).
create or replace function public.apply_squad_perk_rules(p_squad uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event uuid; v_size int; r public.perk_rules; v_count int := 0; v_n int;
begin
  select event_id into v_event from public.squads where id = p_squad;
  select count(*) into v_size from public.squad_members where squad_id = p_squad and status = 'joined';
  for r in select * from public.perk_rules where event_id = v_event and is_active and trigger->>'kind' = 'squad_size' loop
    if v_size >= (r.trigger->>'min_members')::int
       and (r.trigger->>'before' is null or now() <= (r.trigger->>'before')::timestamptz) then
      insert into public.user_perks_qrs (event_id, user_id, squad_id, title, perk_type, source, source_ref_id)
      select v_event, m.user_id, p_squad, r.title, r.perk_type, 'perk_rule', r.id
      from public.squad_members m where m.squad_id = p_squad and m.status = 'joined'
      on conflict (user_id, source_ref_id) where source = 'perk_rule' do nothing;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;
    end if;
  end loop;
  return v_count;
end $$;

create or replace function public.tg_squad_member_joined()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'joined' then perform public.apply_squad_perk_rules(new.squad_id); end if;
  return new;
end $$;
-- Una regla nueva o reactivada aplica retroactivamente a los squads que ya cumplen (idéntico al motor).
create or replace function public.tg_perk_rule_apply()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_sq uuid;
begin
  if new.is_active then
    for v_sq in select id from public.squads where event_id = new.event_id loop
      perform public.apply_squad_perk_rules(v_sq);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists perk_rule_apply on public.perk_rules;
create trigger perk_rule_apply after insert or update of is_active, trigger on public.perk_rules
  for each row execute function public.tg_perk_rule_apply();

drop trigger if exists squad_member_joined on public.squad_members;
create trigger squad_member_joined after insert or update of status on public.squad_members
  for each row execute function public.tg_squad_member_joined();

-- 🚨 Botón de Rescate
create or replace function public.trigger_rescue(p_event uuid, p_x double precision, p_y double precision, p_sector text default null)
returns public.map_pins language plpgsql security definer set search_path = public, extensions as $$
declare v_squad uuid; v_pin public.map_pins; v_name text;
begin
  v_squad := public.user_squad(p_event, auth.uid());
  if v_squad is null then raise exception 'no_squad'; end if;
  delete from public.map_pins where event_id = p_event and user_id = auth.uid();
  insert into public.map_pins (event_id, user_id, coord_x, coord_y, sector_name, note, is_rescue_alert, share_with_squad)
  values (p_event, auth.uid(), p_x, p_y, p_sector, '🚨 Necesito ayuda — vengan a mi pin', true, true) returning * into v_pin;
  update public.squad_members set safety_status = 'rescue_needed' where squad_id = v_squad and user_id = auth.uid();
  select split_part(full_name, ' ', 1) into v_name from public.profiles where id = auth.uid();
  insert into public.messages (event_id, conversation_type, squad_id, sender_id, message_type, content)
  values (p_event, 'squad', v_squad, auth.uid(), 'system_alert',
          '🚨 RESCATE: ' || v_name || ' necesita que vayan a su pin' || coalesce(' (' || p_sector || ')', ''));
  return v_pin;
end $$;

-- Pin-Drop de 15 min: 1 activo por usuario; solo comparte con matches REALES seleccionados.
create or replace function public.drop_pin(p_event uuid, p_x double precision, p_y double precision, p_sector text,
                                           p_share_with_squad boolean, p_match_ids uuid[] default '{}', p_note text default null)
returns public.map_pins language plpgsql security definer set search_path = public, extensions as $$
declare v_matches uuid[]; v_pin public.map_pins;
begin
  if not public.lobby_is_open(p_event) or not public.is_event_attendee(p_event) then raise exception 'not_allowed'; end if;
  if not public.event_feature(p_event, 'enableVenueMap') then raise exception 'feature_disabled'; end if;
  select coalesce(array_agg(m), '{}') into v_matches from unnest(coalesce(p_match_ids, '{}')) m
   where public.is_match(p_event, auth.uid(), m) and not public.is_blocked(auth.uid(), m);
  p_share_with_squad := p_share_with_squad and public.user_squad(p_event, auth.uid()) is not null;
  if not p_share_with_squad and cardinality(v_matches) = 0 then raise exception 'choose_audience'; end if;
  delete from public.map_pins where event_id = p_event and user_id = auth.uid();
  insert into public.map_pins (event_id, user_id, coord_x, coord_y, sector_name, note, share_with_squad, shared_match_ids)
  values (p_event, auth.uid(), p_x, p_y, p_sector, nullif(left(trim(p_note), 60), ''), p_share_with_squad, v_matches)
  returning * into v_pin;
  update public.event_attendees set last_active_at = now() where event_id = p_event and user_id = auth.uid();
  return v_pin;
end $$;

-- 🚩 Punto Base del Squad (+ aviso en el chat)
create or replace function public.set_squad_base_pin(p_squad uuid, p_x double precision, p_y double precision, p_label text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_event uuid; v_label text := coalesce(nullif(trim(p_label), ''), 'Nuestro Punto de Encuentro');
begin
  if not public.is_squad_member(p_squad) then raise exception 'not_member'; end if;
  update public.squads set base_pin_x = p_x, base_pin_y = p_y, base_pin_label = v_label where id = p_squad returning event_id into v_event;
  insert into public.messages (event_id, conversation_type, squad_id, sender_id, message_type, content)
  values (v_event, 'squad', p_squad, auth.uid(), 'system_alert', '🚩 Nuevo Punto Base: ' || v_label);
end $$;

create or replace function public.announce_base_meetup(p_squad uuid, p_minutes int default 10)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_sq public.squads;
begin
  if not public.is_squad_member(p_squad) then raise exception 'not_member'; end if;
  select * into v_sq from public.squads where id = p_squad;
  if v_sq.base_pin_x is null then raise exception 'no_base_pin'; end if;
  insert into public.messages (event_id, conversation_type, squad_id, sender_id, message_type, content)
  values (v_sq.event_id, 'squad', p_squad, auth.uid(), 'system_alert', '🚩 ¡Nos vemos en el Punto Base en ' || greatest(1, least(p_minutes, 60)) || ' min!');
end $$;

-- 🏠 Ya llegué bien a casa / ✅ Ya estoy bien
create or replace function public.set_safety_status(p_event uuid, p_status safety_status_t)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_squad uuid; v_name text;
begin
  v_squad := public.user_squad(p_event, auth.uid());
  if v_squad is null then raise exception 'no_squad'; end if;
  update public.squad_members set safety_status = p_status where squad_id = v_squad and user_id = auth.uid();
  select split_part(full_name, ' ', 1) into v_name from public.profiles where id = auth.uid();
  if p_status = 'home_safe' then
    delete from public.map_pins where event_id = p_event and user_id = auth.uid();
  else
    update public.map_pins set is_rescue_alert = false where event_id = p_event and user_id = auth.uid();
  end if;
  insert into public.messages (event_id, conversation_type, squad_id, sender_id, message_type, content)
  values (p_event, 'squad', v_squad, auth.uid(), 'system_alert',
          case p_status when 'home_safe' then '🏠 ' || v_name || ' llegó bien a casa' else '✅ ' || v_name || ' ya está bien' end);
end $$;

-- Text Blast segmentado: materializa la audiencia en blast_deliveries.
create or replace function public.send_blast(p_event uuid, p_title text, p_message text, p_segment jsonb,
                                             p_cta_label text default null, p_cta_link text default null, p_flash_minutes int default null)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_blast uuid; v_n int;
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  insert into public.event_blasts (event_id, title, message, target_segment, cta_label, cta_link, is_flash_promo, expires_at)
  values (p_event, p_title, p_message, p_segment, p_cta_label, p_cta_link, p_flash_minutes is not null,
          case when p_flash_minutes is not null then now() + make_interval(mins => p_flash_minutes) end)
  returning id into v_blast;

  insert into public.blast_deliveries (blast_id, user_id)
  select v_blast, a.user_id from public.event_attendees a
  where a.event_id = p_event and case p_segment->>'kind'
    when 'all' then true
    when 'mood' then a.mood_tag::text = p_segment->>'mood'
    when 'squad_min_size' then (
      select count(*) from public.squad_members m2
      where m2.squad_id = public.user_squad(p_event, a.user_id) and m2.status = 'joined') >= (p_segment->>'min')::int
    when 'sector' then exists (
      select 1 from public.map_pins p where p.event_id = p_event and p.user_id = a.user_id
        and p.expires_at > now() and p.sector_name = p_segment->>'sector_name')
    when 'top_spenders' then a.user_id in (
      select a2.user_id from public.event_attendees a2 where a2.event_id = p_event
      order by a2.total_spent desc limit (p_segment->>'limit')::int)
    else false end;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Ruleta de sorteo en vivo
create or replace function public.draw_raffle(p_raffle uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_r public.raffles; v_winner uuid; v_perk uuid;
begin
  select * into v_r from public.raffles where id = p_raffle for update;
  if not public.is_event_manager(v_r.event_id) then raise exception 'forbidden'; end if;
  if v_r.winner_user_id is not null then raise exception 'already_drawn'; end if;

  select a.user_id into v_winner from public.event_attendees a
  join public.profiles p on p.id = a.user_id
  where a.event_id = v_r.event_id and case v_r.filter
    when 'all' then true
    when 'female' then p.gender = 'female'
    when 'in_squad' then public.user_squad(v_r.event_id, a.user_id) is not null
    when 'active_pin' then exists (select 1 from public.map_pins mp where mp.event_id = v_r.event_id and mp.user_id = a.user_id and mp.expires_at > now())
  end
  order by random() limit 1;
  if v_winner is null then raise exception 'no_participants'; end if;

  insert into public.user_perks_qrs (event_id, user_id, squad_id, title, perk_type, source, source_ref_id)
  values (v_r.event_id, v_winner, public.user_squad(v_r.event_id, v_winner), '🏆 ' || v_r.prize_title, 'raffle_prize', 'raffle', v_r.id)
  returning id into v_perk;
  update public.raffles set winner_user_id = v_winner, winner_perk_id = v_perk, drawn_at = now() where id = p_raffle;
  return v_winner;
end $$;

-- Canje de QR en la barra (staff)
create or replace function public.redeem_perk(p_qr text)
returns public.user_perks_qrs language plpgsql security definer set search_path = public, extensions as $$
declare v_p public.user_perks_qrs;
begin
  select * into v_p from public.user_perks_qrs where qr_code_string = p_qr for update;
  if not found then raise exception 'invalid_qr'; end if;
  if not public.has_staff_role(v_p.event_id, array['owner','manager','bartender']::staff_role_t[]) then raise exception 'forbidden'; end if;
  if v_p.status = 'redeemed' then raise exception 'already_redeemed'; end if;
  update public.user_perks_qrs set status = 'redeemed', redeemed_at = now() where id = v_p.id returning * into v_p;
  return v_p;
end $$;

-- Gasto de un pedido (CRM): el compartido se reparte entre quienes lo consumen. Interna: solo la usan otras RPC.
create or replace function public.apply_order_spend(p_order public.bar_orders)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if cardinality(p_order.split_user_ids) > 0 then
    update public.event_attendees set total_spent = total_spent + round(p_order.total_amount / cardinality(p_order.split_user_ids), 2)
     where event_id = p_order.event_id and user_id = any(p_order.split_user_ids);
  else
    update public.event_attendees set total_spent = total_spent + p_order.total_amount
     where event_id = p_order.event_id and user_id = p_order.user_id;
  end if;
end $$;

-- Barra Express: precios desde el servidor. p_items: [{"item_id":"gin","qty":2}, ...]
-- [v1.4] p_split: integrantes del Squad que lo comparten (Vaquita / botella para la mesa → cuentas de la mesa).
-- Si la marca cobra con Mercado Pago, nace awaiting_payment y el gasto se suma al confirmarse el pago.
drop function if exists public.create_bar_order(uuid, jsonb, delivery_type_t);
create or replace function public.create_bar_order(p_event uuid, p_items jsonb, p_delivery delivery_type_t, p_split uuid[] default null)
returns public.bar_orders language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid(); v_delivery delivery_type_t := p_delivery;
  v_items jsonb; v_total numeric(12,2); v_squad uuid; v_split uuid[] := '{}';
  v_pin public.map_pins; v_order public.bar_orders; v_pay text;
begin
  if p_delivery = 'icebreaker_gift' then raise exception 'use_send_icebreaker'; end if;
  if not public.lobby_is_open(p_event) or not public.is_event_attendee(p_event, v_uid) then raise exception 'not_allowed'; end if;
  if not public.event_feature(p_event, 'enableSmartBar') then raise exception 'feature_disabled'; end if;

  select jsonb_agg(jsonb_build_object('item_id', m.id, 'name', m.emoji || ' ' || m.name, 'qty', least(greatest((i->>'qty')::int, 1), 20), 'unit_price', m.price)),
         sum(m.price * least(greatest((i->>'qty')::int, 1), 20))
    into v_items, v_total
  from jsonb_array_elements(p_items) i
  join public.bar_menu_items m on m.event_id = p_event and m.id = i->>'item_id' and m.is_available;
  if v_items is null then raise exception 'empty_order'; end if;

  v_squad := public.user_squad(p_event, v_uid);
  if p_delivery = 'squad_split' or coalesce(cardinality(p_split), 0) > 0 then
    if v_squad is null then raise exception 'squad_required'; end if;
    if coalesce(cardinality(p_split), 0) > 0 then
      select array_agg(distinct u) into v_split from unnest(p_split) as u;
    else
      select array_agg(user_id) into v_split from public.squad_members where squad_id = v_squad and status = 'joined';
    end if;
    if exists (select 1 from unnest(v_split) as u where not public.is_squad_member(v_squad, u)) then raise exception 'split_not_member'; end if;
    if not exists (select 1 from unnest(v_split) as u where u <> v_uid) then raise exception 'split_required'; end if;
    if v_delivery = 'fast_pickup' then v_delivery := 'squad_split'; end if;
  end if;
  if v_delivery = 'pin_delivery' then
    select * into v_pin from public.map_pins where event_id = p_event and user_id = v_uid and expires_at > now() order by created_at desc limit 1;
    if v_pin.id is null then raise exception 'pin_required'; end if;
  end if;

  v_pay := case when exists (select 1 from public.events e join public.brands b on b.id = e.brand_id where e.id = p_event and b.payments_enabled)
                then 'awaiting_payment' else 'pay_at_bar' end;
  insert into public.bar_orders (event_id, user_id, squad_id, delivery_type, items_json, total_amount, split_user_ids, pickup_code,
                                 pin_coord_x, pin_coord_y, sector_name, payment_status)
  values (p_event, v_uid, v_squad, v_delivery, v_items, v_total, coalesce(v_split, '{}'),
          case when v_delivery in ('fast_pickup','squad_split') then upper(encode(gen_random_bytes(2), 'hex')) end,
          v_pin.coord_x, v_pin.coord_y, v_pin.sector_name, v_pay)
  returning * into v_order;

  if v_pay = 'pay_at_bar' then perform public.apply_order_spend(v_order); end if;
  return v_order;
end $$;

-- [v1.4] Acredita un pago de Mercado Pago. SOLO el servidor (service role), después de verificar el pago con la API
-- de Mercado Pago (estado aprobado, external_reference = pedido, monto exacto). Idempotente.
create or replace function public.confirm_order_payment(p_order uuid, p_payment_ref text, p_amount numeric)
returns public.bar_orders language plpgsql security definer set search_path = public, extensions as $$
declare v_o public.bar_orders;
begin
  select * into v_o from public.bar_orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.payment_status = 'paid' then return v_o; end if;
  if v_o.payment_status <> 'awaiting_payment' then raise exception 'not_online_payment'; end if;
  if abs(p_amount - v_o.total_amount) > 0.009 then raise exception 'amount_mismatch'; end if;
  update public.bar_orders set payment_status = 'paid', payment_ref = p_payment_ref, paid_at = now(), updated_at = now()
   where id = p_order returning * into v_o;
  perform public.apply_order_spend(v_o);
  -- [v1.7] Trago regalado desde el chat: el QR le llega a quien lo recibe recién con el pago acreditado.
  if v_o.gift_to is not null and not exists (select 1 from public.user_perks_qrs where source_ref_id = v_o.id) then
    insert into public.user_perks_qrs (event_id, user_id, title, perk_type, source, source_ref_id)
    values (v_o.event_id, v_o.gift_to, '🎁 ' || coalesce(v_o.items_json->0->>'name', 'Trago') || ' — regalo', 'gifted_drink', 'manual', v_o.id);
  end if;
  -- [v1.7] Mesa VIP dividida: con el 100 % pagado se libera el QR grupal (uno por integrante), una sola vez.
  if v_o.vip_reservation_id is not null
     and not exists (select 1 from public.bar_orders where vip_reservation_id = v_o.vip_reservation_id and payment_status <> 'paid')
     and not exists (select 1 from public.user_perks_qrs where source_ref_id = v_o.vip_reservation_id) then
    insert into public.user_perks_qrs (event_id, user_id, squad_id, title, perk_type, source, source_ref_id)
    select o.event_id, o.user_id, o.squad_id, '🍾 Mesa VIP · ' || r.label || ' — acceso grupal', 'fast_pass', 'manual', r.id
      from public.bar_orders o join public.vip_reservations r on r.id = o.vip_reservation_id where o.vip_reservation_id = v_o.vip_reservation_id;
  end if;
  return v_o;
end $$;

-- [v1.4] Quien pidió cancela un pedido que todavía no pagó.
create or replace function public.cancel_unpaid_order(p_order uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.bar_orders where id = p_order and user_id = auth.uid() and payment_status = 'awaiting_payment';
  if not found then raise exception 'not_found'; end if;
end $$;

-- [v1.4] Mis cuentas de cobro conectadas (sin tokens).
create or replace function public.my_brand_payments()
returns table (brand_id uuid, provider text, account_label text, live_mode boolean, connected_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select a.brand_id, a.provider, a.account_label, a.live_mode, a.connected_at
  from public.brand_payment_accounts a join public.brands b on b.id = a.brand_id
  where b.owner_id = auth.uid();
$$;

-- [v1.4] La marca de un evento tiene que ser de quien lo creó (espejo de checkEventBranding).
create or replace function public.tg_event_brand_owner()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.brand_id is not null and not exists (select 1 from public.brands b where b.id = new.brand_id and b.owner_id = new.created_by) then
    raise exception 'brand_not_owned';
  end if;
  return new;
end $$;
drop trigger if exists events_brand_owner on public.events;
create trigger events_brand_owner before insert or update of brand_id on public.events
  for each row execute function public.tg_event_brand_owner();

-- [v1.4] Cuentas de la mesa (espejo de src/lib/engine/settle.ts). Funcionan también con el lobby cerrado.
create or replace function public.add_squad_expense(p_squad uuid, p_description text, p_amount numeric, p_participants uuid[])
returns public.squad_expenses language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.squad_expenses; v_parts uuid[];
begin
  if not public.is_squad_member(p_squad) then raise exception 'not_member'; end if;
  if not public.event_feature(public.squad_event(p_squad), 'enableSquadBillSplit') then raise exception 'feature_disabled'; end if;
  if char_length(trim(coalesce(p_description, ''))) not between 1 and 60 then raise exception 'invalid_expense'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 50000000 then raise exception 'invalid_amount'; end if;
  select array_agg(distinct u) into v_parts from unnest(p_participants) as u;
  if coalesce(cardinality(v_parts), 0) = 0 then raise exception 'split_required'; end if;
  if exists (select 1 from unnest(v_parts) as u where not public.is_squad_member(p_squad, u)) then raise exception 'split_not_member'; end if;
  insert into public.squad_expenses (squad_id, event_id, paid_by, description, amount, participant_ids)
  values (p_squad, public.squad_event(p_squad), auth.uid(), trim(p_description), round(p_amount, 2), v_parts)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.record_settlement(p_squad uuid, p_to uuid, p_amount numeric, p_method text default 'transfer')
returns public.squad_settlements language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.squad_settlements;
begin
  if not public.is_squad_member(p_squad) or not public.is_squad_member(p_squad, p_to) then raise exception 'not_member'; end if;
  if p_to = auth.uid() then raise exception 'invalid_settlement'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 50000000 then raise exception 'invalid_amount'; end if;
  insert into public.squad_settlements (squad_id, event_id, from_user, to_user, amount, method)
  values (p_squad, public.squad_event(p_squad), auth.uid(), p_to, round(p_amount, 2), coalesce(p_method, 'transfer'))
  returning * into v_row;
  return v_row;
end $$;

-- Quien recibe confirma ("Recibido") o rechaza ("No me llegó"); quien la envió puede anularla mientras no se confirme.
create or replace function public.respond_settlement(p_settlement uuid, p_received boolean)
returns public.squad_settlements language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.squad_settlements;
begin
  select * into v_row from public.squad_settlements where id = p_settlement for update;
  if not found or (v_row.to_user <> auth.uid() and not (v_row.from_user = auth.uid() and not p_received)) then raise exception 'forbidden'; end if;
  if v_row.confirmed_at is not null then raise exception 'already_confirmed'; end if;
  if p_received then
    update public.squad_settlements set confirmed_at = now() where id = p_settlement returning * into v_row;
    return v_row;
  end if;
  delete from public.squad_settlements where id = p_settlement;
  return null;
end $$;

-- Sectores visitados (alimenta el filtro post-fiesta "Coincidieron en tu zona")
create or replace function public.tg_pin_mark_visited()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.sector_name is not null then
    update public.event_attendees
       set visited_sectors = array_append(visited_sectors, new.sector_name)
     where event_id = new.event_id and user_id = new.user_id and not (new.sector_name = any(visited_sectors));
  end if;
  return new;
end $$;
drop trigger if exists pin_mark_visited on public.map_pins;
create trigger pin_mark_visited after insert on public.map_pins for each row execute function public.tg_pin_mark_visited();

create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists bar_orders_touch on public.bar_orders;
create trigger bar_orders_touch before update on public.bar_orders for each row execute function public.tg_touch_updated_at();

-- Kanban de barra: avanza un pedido al siguiente estado de SU flujo (solo staff).
create or replace function public.advance_bar_order(p_order uuid)
returns public.bar_orders language plpgsql security definer set search_path = public, extensions as $$
declare v_o public.bar_orders; v_flow bar_order_status_t[]; v_i int;
begin
  select * into v_o from public.bar_orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if not public.can_operate_bar(v_o.event_id) then raise exception 'forbidden'; end if;
  if v_o.payment_status = 'awaiting_payment' then raise exception 'not_paid'; end if;
  v_flow := case when v_o.delivery_type = 'pin_delivery'
                 then array['pending','preparing','delivering','completed']::bar_order_status_t[]
                 else array['pending','preparing','ready_qr','completed']::bar_order_status_t[] end;
  v_i := array_position(v_flow, v_o.status);
  if v_i is null or v_i = cardinality(v_flow) then raise exception 'final_status'; end if;
  update public.bar_orders set status = v_flow[v_i + 1] where id = p_order returning * into v_o;
  return v_o;
end $$;

-- Ventanilla rápida: entrega el pedido solo si está "Listo para retiro".
create or replace function public.redeem_pickup_code(p_event uuid, p_code text)
returns public.bar_orders language plpgsql security definer set search_path = public, extensions as $$
declare v_o public.bar_orders; v_code text := upper(regexp_replace(trim(p_code), '^ROUGE:ORDER:[^:]+:', '', 'i'));
begin
  if not public.can_operate_bar(p_event) then raise exception 'forbidden'; end if;
  select * into v_o from public.bar_orders where event_id = p_event and upper(pickup_code) = v_code for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status = 'completed' then raise exception 'already_delivered'; end if;
  if v_o.payment_status = 'awaiting_payment' then raise exception 'not_paid'; end if;
  if v_o.status <> 'ready_qr' then raise exception 'not_ready'; end if;
  update public.bar_orders set status = 'completed' where id = v_o.id returning * into v_o;
  return v_o;
end $$;

-- Votar / pedir tema
create or replace function public.vote_song(p_event uuid, p_title text, p_artist text default '')
returns public.song_requests language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.song_requests;
begin
  if not public.is_event_attendee(p_event) then raise exception 'not_attendee'; end if;
  select * into v_row from public.song_requests where event_id = p_event and lower(title) = lower(trim(p_title)) for update;
  if found then
    update public.song_requests
       set voter_ids = case when auth.uid() = any(voter_ids) then array_remove(voter_ids, auth.uid()) else voter_ids || auth.uid() end
     where id = v_row.id returning * into v_row;
  else
    insert into public.song_requests (event_id, requested_by, title, artist, voter_ids)
    values (p_event, auth.uid(), trim(p_title), coalesce(trim(p_artist), ''), array[auth.uid()]) returning * into v_row;
  end if;
  return v_row;
end $$;

-- CRM B2B (incluye teléfono → solo staff) con Smart Tags.
create or replace function public.event_crm(p_event uuid)
returns table (
  user_id uuid, full_name text, username citext, phone text, age int, gender gender_t, music_genres text[],
  squad_size int, matches int, total_spent numeric, joined_at timestamptz, tags text[]
) language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  return query
  with base as (
    select a.user_id, p.full_name, p.username, p.phone_normalized as phone,
           date_part('year', age(p.birth_date))::int as age, p.gender, p.music_genres, a.total_spent, a.joined_at,
           (select count(*)::int from public.squad_members m where m.squad_id = public.user_squad(p_event, a.user_id) and m.status = 'joined') as squad_size,
           (select count(*)::int from public.connections c where c.event_id = p_event and c.status = 'accepted' and a.user_id in (c.sender_id, c.receiver_id)) as matches,
           (select count(*)::int from public.squad_members m where m.invited_by = a.user_id and m.status = 'joined') as brought,
           exists (select 1 from public.squads s where s.event_id = p_event and s.created_by = a.user_id) as is_creator,
           percent_rank() over (order by a.total_spent desc) as spend_rank
    from public.event_attendees a join public.profiles p on p.id = a.user_id
    where a.event_id = p_event
  )
  select b.user_id, b.full_name, b.username, b.phone, b.age, b.gender, b.music_genres, b.squad_size, b.matches, b.total_spent, b.joined_at,
         array_remove(array[
           case when b.total_spent > 0 and b.spend_rank <= 0.10 then 'top_spender' end,
           case when (b.is_creator and b.squad_size >= 4) or b.brought >= 4 then 'squad_leader' end,
           case when b.matches >= 3 then 'power_matcher' end
         ], null)
  from base b
  order by b.total_spent desc;
end $$;

-- Métricas agregadas para el staff. Las conexiones son privadas (el organizador NO ve quién
-- hizo match con quién): solo conteos, y matches por persona para el Smart Tag "Power Matcher".
create or replace function public.event_stats(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if not public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'matches',            count(*) filter (where status = 'accepted'),
    'pending_connections', count(*) filter (where status = 'pending'),
    'icebreakers_sent',   count(*) filter (where type = 'icebreaker'),
    'matches_last_hour',  count(*) filter (where status = 'accepted' and responded_at > now() - interval '1 hour'),
    'matches_by_user',    coalesce((
      select jsonb_object_agg(u, n) from (
        select u, count(*) n from public.connections c2, unnest(array[c2.sender_id, c2.receiver_id]) u
        where c2.event_id = p_event and c2.status = 'accepted' group by u) t), '{}'::jsonb)
  ) into v
  from public.connections where event_id = p_event;
  return v;
end $$;

-- Generador de códigos únicos de 1 uso (lote)
-- Código de acceso: 10 caracteres de un alfabeto de 32 sin 0/O/1/I (≈ 2^50 combinaciones; sin sesgo: 256 % 32 = 0).
create or replace function public.new_access_code(p_len int default 10)
returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(r.b, i) % 32) + 1, 1), '' order by i)
  from (select gen_random_bytes(p_len) as b) r, generate_series(0, p_len - 1) i;
$$;

create or replace function public.generate_invite_codes(p_event uuid, p_count int)
returns setof public.event_invite_codes language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  if p_count < 1 or p_count > 1000 then raise exception 'invalid_count'; end if;
  return query
  with ins as (
    insert into public.event_invite_codes (event_id, code)
    select p_event, public.new_access_code() from generate_series(1, p_count)
    on conflict (code) do nothing
    returning *
  ) select * from ins;
end $$;

-- Limpieza de pines vencidos (programar con pg_cron cada 5 min:
--   select cron.schedule('purge-pins', '*/5 * * * *', $$select public.purge_expired_pins()$$); )
-- Equipo del evento (espejo de setStaffRole): solo dueño/a; p_role null = quitar. Busca por @username.
create or replace function public.set_staff_role(p_event uuid, p_username text, p_role staff_role_t default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_creator uuid;
begin
  if not public.has_staff_role(p_event, array['owner']::staff_role_t[]) then raise exception 'forbidden'; end if;
  select created_by into v_creator from public.events where id = p_event;
  select id into v_user from public.profiles where username = lower(ltrim(trim(p_username), '@'));
  if v_user is null then raise exception 'staff_user_not_found'; end if;
  if v_user = v_creator then raise exception 'staff_is_creator'; end if;
  if p_role is null then
    delete from public.event_staff where event_id = p_event and user_id = v_user;
  else
    insert into public.event_staff (event_id, user_id, role) values (p_event, v_user, p_role)
    on conflict (event_id, user_id) do update set role = excluded.role;
  end if;
  return v_user;
end $$;

-- ═══ API v1 para clientes empresariales ═══════════════════════════════════════
-- Crear clave (dueño/a o producción). Devuelve la clave completa UNA sola vez.
create or replace function public.create_api_key(p_name text, p_event uuid default null, p_scopes text[] default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_key text; v_id uuid; v_prefix text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_event is not null and not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  if p_event is null and not exists (
    select 1 from public.events e where e.created_by = v_uid
    union all select 1 from public.event_staff s where s.user_id = v_uid and s.role in ('owner', 'manager')
  ) then raise exception 'forbidden'; end if;
  if char_length(coalesce(trim(p_name), '')) = 0 then raise exception 'invalid_name'; end if;
  v_prefix := 'rk_live_' || encode(gen_random_bytes(5), 'hex');
  v_key := v_prefix || '_' || encode(gen_random_bytes(24), 'hex');
  insert into public.api_keys (name, prefix, key_hash, created_by, event_id, scopes)
  values (trim(p_name), v_prefix, encode(digest(v_key, 'sha256'), 'hex'), v_uid, p_event, coalesce(p_scopes, array['codes:read', 'codes:write']))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key, 'prefix', v_prefix);
end $$;

create or replace function public.revoke_api_key(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_id and created_by = auth.uid();
  if not found then raise exception 'not_found'; end if;
end $$;

-- ¿Esta clave puede usar este evento con este permiso? (clave activa, alcance del evento y quien la creó
-- sigue siendo dueño/a o producción: si lo sacan del equipo, sus claves dejan de funcionar).
create or replace function public.api_authorize(p_key uuid, p_event uuid, p_scope text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.api_keys k
    where k.id = p_key and k.revoked_at is null and p_scope = any(k.scopes)
      and (k.event_id is null or k.event_id = p_event)
      and public.is_event_manager(p_event, k.created_by)
  );
$$;

-- Eventos accesibles por una clave.
create or replace function public.api_key_events(p_key uuid)
returns setof public.events language sql stable security definer set search_path = public, extensions as $$
  select e.* from public.events e, public.api_keys k
  where k.id = p_key and k.revoked_at is null and (k.event_id is null or k.event_id = e.id)
    and public.is_event_manager(e.id, k.created_by)
  order by e.starts_at;
$$;

-- Emitir códigos: por cantidad, o uno por entrada con su external_ref (idempotente: reintentar devuelve el mismo código).
create or replace function public.api_issue_codes(p_key uuid, p_event uuid, p_count int default null, p_tickets jsonb default null, p_label text default null)
returns table (id uuid, code text, external_ref text, label text, is_used boolean, used_at timestamptz, revoked_at timestamptz, created_at timestamptz, created boolean)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare v_n int;
begin
  if not public.api_authorize(p_key, p_event, 'codes:write') then raise exception 'forbidden'; end if;
  if p_tickets is not null then
    if jsonb_typeof(p_tickets) <> 'array' then raise exception 'invalid_tickets'; end if;
    v_n := jsonb_array_length(p_tickets);
    if v_n < 1 or v_n > 1000 then raise exception 'invalid_count'; end if;
    if exists (select 1 from jsonb_array_elements(p_tickets) t
               where jsonb_typeof(t) <> 'object' or char_length(coalesce(t->>'external_ref', '')) not between 1 and 120
                  or char_length(coalesce(t->>'label', p_label, '')) > 60) then raise exception 'invalid_tickets'; end if;
    if (select count(distinct t->>'external_ref') from jsonb_array_elements(p_tickets) t) <> v_n then raise exception 'duplicate_external_ref'; end if;
    return query
    with inserted as (
      insert into public.event_invite_codes as c (event_id, code, external_ref, label, source, api_key_id)
      select p_event, public.new_access_code(), t->>'external_ref', coalesce(t->>'label', p_label), 'api', p_key
      from jsonb_array_elements(p_tickets) t
      on conflict (event_id, external_ref) where external_ref is not null do nothing
      returning c.*
    )
    -- Las filas nuevas salen del CTE (la sentencia no ve sus propios inserts); las existentes, de la tabla.
    select r.id, r.code, r.external_ref, r.label, r.is_used, r.used_at, r.revoked_at, r.created_at, r.created from (
      select i.id, i.code, i.external_ref, i.label, i.is_used, i.used_at, i.revoked_at, i.created_at, true as created from inserted i
      union all
      select c.id, c.code, c.external_ref, c.label, c.is_used, c.used_at, c.revoked_at, c.created_at, false
      from public.event_invite_codes c
      where c.event_id = p_event and c.external_ref in (select t->>'external_ref' from jsonb_array_elements(p_tickets) t)
        and c.id not in (select i.id from inserted i)
    ) r order by r.created_at, r.id;
  else
    if p_count is null or p_count < 1 or p_count > 1000 then raise exception 'invalid_count'; end if;
    if char_length(coalesce(p_label, '')) > 60 then raise exception 'invalid_tickets'; end if;
    return query
    with inserted as (
      insert into public.event_invite_codes as c (event_id, code, label, source, api_key_id)
      select p_event, public.new_access_code(), p_label, 'api', p_key from generate_series(1, p_count)
      on conflict (code) do nothing
      returning c.*
    ) select i.id, i.code, i.external_ref, i.label, i.is_used, i.used_at, i.revoked_at, i.created_at, true from inserted i order by i.created_at, i.id;
  end if;
  update public.api_keys set last_used_at = now() where api_keys.id = p_key;
end $$;

-- Anular un código no usado (entrada reembolsada o cancelada). Idempotente.
create or replace function public.api_revoke_code(p_key uuid, p_event uuid, p_code text)
returns public.event_invite_codes language plpgsql security definer set search_path = public, extensions as $$
declare v public.event_invite_codes;
begin
  if not public.api_authorize(p_key, p_event, 'codes:write') then raise exception 'forbidden'; end if;
  select * into v from public.event_invite_codes c where c.event_id = p_event and upper(c.code) = upper(trim(p_code)) for update;
  if not found then raise exception 'code_not_found'; end if;
  if v.is_used then raise exception 'code_already_used'; end if;
  update public.event_invite_codes c set revoked_at = coalesce(c.revoked_at, now()) where c.id = v.id returning * into v;
  update public.api_keys set last_used_at = now() where api_keys.id = p_key;
  return v;
end $$;

create or replace function public.purge_expired_pins()
returns int language sql security definer set search_path = public, extensions as $$
  with d as (delete from public.map_pins where expires_at <= now() returning 1) select count(*)::int from d;
$$;

-- [v1.5] Expulsar del evento (espejo de removeAttendee): sale del lobby, de su Squad de esta noche y del plano.
-- Con p_ban no puede volver a entrar a este evento. No toca su perfil, matches ni chats. No se expulsa al equipo.
create or replace function public.remove_attendee(p_event uuid, p_user uuid, p_ban boolean default false, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_attending boolean;
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.events where id = p_event and created_by = p_user)
     or exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user) then
    raise exception 'is_staff';
  end if;
  v_attending := exists (select 1 from public.event_attendees where event_id = p_event and user_id = p_user);
  if not v_attending and not p_ban then raise exception 'not_attendee'; end if;
  delete from public.event_attendees where event_id = p_event and user_id = p_user;
  delete from public.squad_members m using public.squads q where q.id = m.squad_id and q.event_id = p_event and m.user_id = p_user;
  delete from public.map_pins where event_id = p_event and user_id = p_user;
  if p_ban then
    insert into public.event_bans (event_id, user_id, banned_by, reason) values (p_event, p_user, auth.uid(), nullif(trim(p_reason), ''))
    on conflict (event_id, user_id) do nothing;
  end if;
  return p_ban;
end $$;

-- [v1.5] Solo se borra un evento al que no entró nadie (creado por error o de prueba): los matches y chats de un evento
-- real quedan para siempre y los cobros de Mercado Pago se conservan.
create or replace function public.tg_events_keep_payments()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from public.bar_orders where event_id = old.id and payment_status = 'paid') then raise exception 'event_has_payments'; end if;
  if exists (select 1 from public.event_attendees where event_id = old.id) then raise exception 'event_has_attendees'; end if;
  return old;
end $$;
drop trigger if exists events_keep_payments on public.events;
create trigger events_keep_payments before delete on public.events for each row execute function public.tg_events_keep_payments();

-- [v1.6] RRPP: link propio (lo pide el RRPP o dueño/a/producción para un RRPP del equipo). Código generado acá.
create or replace function public.ensure_promoter_link(p_event uuid, p_user uuid default auth.uid())
returns public.promoter_links language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.promoter_links; v_code text;
begin
  if not public.event_feature(p_event, 'enableRrpp') then raise exception 'feature_disabled'; end if;
  if not exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user and role::text = 'promoter') then raise exception 'not_promoter'; end if;
  if p_user <> auth.uid() and not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  select * into v_row from public.promoter_links where event_id = p_event and user_id = p_user;
  if found then return v_row; end if;
  loop
    v_code := 'RP' || upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=0O1IL', ''), 1, 6));
    exit when char_length(v_code) = 8 and not exists (select 1 from public.promoter_links where code = v_code);
  end loop;
  insert into public.promoter_links (event_id, user_id, code) values (p_event, p_user, v_code) returning * into v_row;
  return v_row;
end $$;

create or replace function public.set_promoter_commission(p_link uuid, p_amount numeric)
returns public.promoter_links language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.promoter_links;
begin
  select * into v_row from public.promoter_links where id = p_link;
  if not found then raise exception 'not_found'; end if;
  if not public.is_event_manager(v_row.event_id) then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then raise exception 'invalid_amount'; end if;
  update public.promoter_links set commission_per_entry = round(p_amount, 2) where id = p_link returning * into v_row;
  return v_row;
end $$;

-- Números por RRPP (espejo de promoterStats): el RRPP ve solo su fila; dueño/a y producción, todas. Sin datos personales.
-- Si el evento usa el escáner de la puerta, se liquida por ingreso confirmado; si no, por ingreso a la app.
drop function if exists public.promoter_stats(uuid);
create or replace function public.promoter_stats(p_event uuid)
returns table (user_id uuid, link_id uuid, code text, commission_per_entry numeric, entries int, checked_in int, billable int, to_pay numeric, bar_spend numeric)
language sql stable security definer set search_path = public, extensions as $$
  with door as (
    select exists (select 1 from public.event_attendees where event_id = p_event and checked_in_at is not null)
        or exists (select 1 from public.event_invite_codes where event_id = p_event and checked_in_at is not null) as uses_door
  ), base as (
    select s.user_id, l.id as link_id, l.code, coalesce(l.commission_per_entry, 0) as commission_per_entry,
           (select count(*)::int from public.event_attendees a where a.event_id = p_event and a.referred_by = s.user_id) as entries,
           (select count(*)::int from public.event_attendees a where a.event_id = p_event and a.referred_by = s.user_id and a.checked_in_at is not null) as checked_in,
           -- [v1.7] consumo en barra de quienes entraron por su link (para el % de barra); solo un total, nunca por persona
           (select coalesce(sum(a.total_spent), 0) from public.event_attendees a where a.event_id = p_event and a.referred_by = s.user_id) as bar_spend
    from public.event_staff s
    left join public.promoter_links l on l.event_id = s.event_id and l.user_id = s.user_id
    where s.event_id = p_event and s.role::text = 'promoter'
      and (public.is_event_manager(p_event) or s.user_id = auth.uid())
  )
  select b.user_id, b.link_id, b.code, b.commission_per_entry, b.entries, b.checked_in,
         case when d.uses_door then b.checked_in else b.entries end as billable,
         round((case when d.uses_door then b.checked_in else b.entries end) * b.commission_per_entry, 2) as to_pay,
         b.bar_spend
  from base b cross join door d
  order by b.entries desc;
$$;

-- [v1.7] Esquema escalonado (espejo de setPromoterScheme). Dueño/a o producción.
create or replace function public.set_promoter_scheme(p_link uuid, p_ticket_price numeric, p_tiers jsonb, p_bar_percent numeric)
returns public.promoter_links language plpgsql security definer set search_path = public, extensions as $$
declare v public.promoter_links; t jsonb; v_prev int := 0;
begin
  select * into v from public.promoter_links where id = p_link for update;
  if v.id is null or not public.is_event_manager(v.event_id) then raise exception 'forbidden'; end if;
  if p_ticket_price < 0 or p_bar_percent < 0 or p_bar_percent > 100 or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 6 then raise exception 'invalid_amount'; end if;
  for t in select value from jsonb_array_elements(p_tiers) order by (value->>'from')::int loop
    if (t->>'from')::int <= v_prev or (t->>'percent')::numeric not between 0 and 100 or (v_prev = 0 and (t->>'from')::int <> 1) then raise exception 'invalid_amount'; end if;
    v_prev := (t->>'from')::int;
  end loop;
  update public.promoter_links set ticket_price = p_ticket_price, commission_tiers = p_tiers, bar_commission_percent = p_bar_percent where id = p_link returning * into v;
  return v;
end $$;

-- [v1.6] Puerta (espejo de doorCheckIn): entrada (código de 1 uso o su URL /join/<código>) o pase de la app
-- (ROUGE:PASS:<evento>:<usuario>). Devuelve nombre, foto y edad para comparar con quien entra. Dueño/a, producción y seguridad.
-- [v1.7] QR dinámico (espejo de engine/qr.ts): firma = primeros 10 hex de HMAC(secreto credencial, 'KIND:ref:paso'),
-- secreto credencial = HMAC(secreto del evento, 'KIND:ref'). Paso de 20 s, tolerancia ±1.
create or replace function public.event_qr_secret_of(p_event uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  select qr_secret into v from public.event_secrets where event_id = p_event;
  if v is null then
    insert into public.event_secrets (event_id) values (p_event) on conflict (event_id) do nothing;
    select qr_secret into v from public.event_secrets where event_id = p_event;
  end if;
  return v;
end $$;

create or replace function public.qr_credential_secret(p_event uuid, p_kind text, p_ref text) returns text language sql security definer set search_path = public, extensions as $$
  select encode(hmac(p_kind || ':' || p_ref, public.event_qr_secret_of(p_event), 'sha256'), 'hex');
$$;

create or replace function public.verify_dynamic_qr(p_event uuid, p_value text)
returns table (status text, kind text, ref text) language plpgsql security definer set search_path = public, extensions as $$
declare m text[]; v_step bigint; v_now bigint := floor(extract(epoch from clock_timestamp()) * 1000 / 20000);
begin
  m := regexp_match(trim(coalesce(p_value, '')), '^ROUGE:T1:(PASS|PERK|ORDER):([A-Za-z0-9-]{4,64}):([0-9]{1,12}):([0-9A-Fa-f]{10})$');
  if m is null then return query select 'format'::text, null::text, null::text; return; end if;
  v_step := m[3]::bigint;
  if upper(left(encode(hmac(m[1] || ':' || m[2] || ':' || m[3], public.qr_credential_secret(p_event, m[1], m[2]), 'sha256'), 'hex'), 10)) <> upper(m[4]) then
    return query select 'forged'::text, m[1], m[2]; return;
  end if;
  if abs(v_now - v_step) > 1 then return query select 'expired'::text, m[1], m[2]; return; end if;
  return query select 'ok'::text, m[1], m[2];
end $$;

-- Secretos de MIS credenciales en el evento (pase, perks y pedidos). Nunca el del evento.
create or replace function public.my_qr_secrets(p_event uuid)
returns table (event_id uuid, kind text, ref text, secret text) language sql security definer set search_path = public, extensions as $$
  select p_event, 'PASS', auth.uid()::text, public.qr_credential_secret(p_event, 'PASS', auth.uid()::text)
   where public.is_event_attendee(p_event)
  union all
  select p_event, 'PERK', q.id::text, public.qr_credential_secret(p_event, 'PERK', q.id::text)
    from public.user_perks_qrs q where q.event_id = p_event and q.user_id = auth.uid() and q.status = 'available'
  union all
  select p_event, 'ORDER', o.id::text, public.qr_credential_secret(p_event, 'ORDER', o.id::text)
    from public.bar_orders o where o.event_id = p_event and o.user_id = auth.uid() and o.pickup_code is not null and o.status <> 'completed';
$$;

-- Clave del evento para la puerta y la barra (validación sin conexión). Nadie más la recibe.
create or replace function public.event_qr_secret(p_event uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_staff_role(p_event, array['owner','manager','security','bartender','waiter']::staff_role_t[]) then raise exception 'forbidden'; end if;
  return public.event_qr_secret_of(p_event);
end $$;

-- [v1.7] Puerta (espejo de engine/door.ts doorCheckIn): pase dinámico TOTP, entrada de 1 uso o su URL. Atómico
-- (FOR UPDATE): el primer escaneo gana y el resto ve "already" con la hora y la terminal. Listas free fuera de
-- horario quedan en 'late_free' hasta cobrar el diferencial (door_settle_late). El pase fijo viejo → 'static_qr'.
create or replace function public.door_scan(p_event uuid, p_value text, p_terminal text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_raw text := trim(coalesce(p_value, '')); v_code text; v_ev public.events; v_c public.event_invite_codes; v_l public.ticket_lists;
  v_att public.event_attendees; v_user uuid; v_p public.profiles; v_status text; v_kind text; v_at timestamptz; v_term text := left(nullif(trim(p_terminal), ''), 40);
  v_chk record; v_late jsonb;
begin
  if not public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  if not public.event_feature(p_event, 'enableTicketing') then raise exception 'feature_disabled'; end if;
  select * into v_ev from public.events where id = p_event;
  if upper(v_raw) like 'ROUGE:T1:%' then
    v_kind := 'pass';
    select * into v_chk from public.verify_dynamic_qr(p_event, v_raw);
    if v_chk.status <> 'ok' then return jsonb_build_object('status', case when v_chk.status = 'format' then 'invalid' else 'expired_qr' end, 'kind', v_kind); end if;
    if v_chk.kind <> 'PASS' then return jsonb_build_object('status', 'invalid', 'kind', v_kind); end if;
    v_user := v_chk.ref::uuid;
    select * into v_att from public.event_attendees where event_id = p_event and user_id = v_user for update;
    select * into v_c from public.event_invite_codes where event_id = p_event and used_by_user_id = v_user and revoked_at is null limit 1 for update;
    select * into v_l from public.ticket_lists where id = v_c.list_id;
    if exists (select 1 from public.event_bans where event_id = p_event and user_id = v_user) then v_status := 'banned';
    elsif v_att.id is null then v_status := 'not_attendee';
    elsif v_att.checked_in_at is not null then v_status := 'already'; v_at := v_att.checked_in_at; v_term := v_att.checked_in_terminal;
    elsif v_c.id is not null and v_c.late_paid_at is null and v_l.free_until is not null and now() > v_l.free_until and v_l.late_price > 0
          and public.event_feature(p_event, 'enableFreeCutoffConversion') then
      v_status := 'late_free'; v_late := jsonb_build_object('code_id', v_c.id, 'list', v_l.name, 'price', v_l.late_price, 'free_until', v_l.free_until);
    else
      update public.event_attendees set checked_in_at = now(), checked_in_terminal = v_term where id = v_att.id returning checked_in_at into v_at;
      if v_c.id is not null then update public.event_invite_codes set checked_in_at = coalesce(checked_in_at, now()), checked_in_by = coalesce(checked_in_by, auth.uid()), checked_in_terminal = coalesce(checked_in_terminal, v_term) where id = v_c.id; end if;
      v_status := 'ok';
    end if;
  elsif upper(v_raw) like 'ROUGE:PASS:%' then
    return jsonb_build_object('status', 'static_qr', 'kind', 'pass');
  else
    v_kind := 'code';
    v_code := upper(coalesce(substring(v_raw from '/join/([^/?#[:space:]]+)'), v_raw));
    if upper(v_ev.slug) = v_code or upper(v_ev.master_invite_code) = v_code or exists (select 1 from public.promoter_links where upper(code) = v_code) then
      return jsonb_build_object('status', 'general_link', 'kind', v_kind);
    end if;
    select * into v_c from public.event_invite_codes where upper(code) = v_code for update;
    if v_c.id is null then return jsonb_build_object('status', 'invalid', 'kind', v_kind); end if;
    if v_c.event_id <> p_event then return jsonb_build_object('status', 'other_event', 'kind', v_kind); end if;
    select * into v_l from public.ticket_lists where id = v_c.list_id;
    v_user := v_c.used_by_user_id;
    if v_c.revoked_at is not null then v_status := 'revoked';
    elsif v_user is not null and exists (select 1 from public.event_bans where event_id = p_event and user_id = v_user) then v_status := 'banned';
    elsif v_c.checked_in_at is not null then v_status := 'already'; v_at := v_c.checked_in_at; v_term := v_c.checked_in_terminal;
    elsif v_c.late_paid_at is null and v_l.free_until is not null and now() > v_l.free_until and v_l.late_price > 0
          and public.event_feature(p_event, 'enableFreeCutoffConversion') then
      v_status := 'late_free'; v_late := jsonb_build_object('code_id', v_c.id, 'list', v_l.name, 'price', v_l.late_price, 'free_until', v_l.free_until);
    else
      update public.event_invite_codes set checked_in_at = now(), checked_in_by = auth.uid(), checked_in_terminal = v_term where id = v_c.id returning checked_in_at into v_at;
      if v_user is not null then update public.event_attendees set checked_in_at = coalesce(checked_in_at, now()), checked_in_terminal = coalesce(checked_in_terminal, v_term) where event_id = p_event and user_id = v_user; end if;
      v_status := 'ok';
    end if;
  end if;
  select * into v_p from public.profiles where id = v_user;
  return jsonb_build_object(
    'status', v_status, 'kind', v_kind, 'user_id', v_p.id, 'name', coalesce(v_p.full_name, v_c.holder_name), 'username', v_p.username,
    'photo', v_p.photos->0->>'url', 'age', case when v_p.id is null then null else date_part('year', age(v_p.birth_date))::int end,
    'label', v_c.label, 'checked_in_at', v_at, 'terminal', case when v_status in ('ok','already') then v_term end, 'late', v_late);
end $$;

-- Cobra el diferencial de una lista free fuera de horario y hace entrar en el mismo paso (atómico).
create or replace function public.door_settle_late(p_event uuid, p_code uuid, p_method text, p_terminal text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_c public.event_invite_codes; v_l public.ticket_lists; v_term text := left(nullif(trim(p_terminal), ''), 40); v_p public.profiles;
begin
  if not public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  if p_method not in ('cash','mercadopago','transfer') then raise exception 'invalid_method'; end if;
  select * into v_c from public.event_invite_codes where id = p_code and event_id = p_event for update;
  if v_c.id is null then raise exception 'not_found'; end if;
  select * into v_p from public.profiles where id = v_c.used_by_user_id;
  if v_c.checked_in_at is not null then
    return jsonb_build_object('status', 'already', 'kind', 'code', 'name', coalesce(v_p.full_name, v_c.holder_name), 'checked_in_at', v_c.checked_in_at, 'terminal', v_c.checked_in_terminal);
  end if;
  select * into v_l from public.ticket_lists where id = v_c.list_id;
  if v_l.id is null or v_l.free_until is null or now() <= v_l.free_until or v_c.late_paid_at is not null then raise exception 'no_late_fee'; end if;
  update public.event_invite_codes set late_paid_at = now(), late_payment_method = p_method, checked_in_at = now(), checked_in_by = auth.uid(), checked_in_terminal = v_term where id = p_code;
  if v_c.used_by_user_id is not null then update public.event_attendees set checked_in_at = coalesce(checked_in_at, now()), checked_in_terminal = coalesce(checked_in_terminal, v_term) where event_id = p_event and user_id = v_c.used_by_user_id; end if;
  perform public.write_audit((select created_by from public.events where id = p_event), p_event, 'courtesy.issued', p_code::text, jsonb_build_object('late_fee', v_l.late_price, 'method', p_method));
  return jsonb_build_object('status', 'ok', 'kind', 'code', 'user_id', v_p.id, 'name', coalesce(v_p.full_name, v_c.holder_name), 'username', v_p.username,
    'photo', v_p.photos->0->>'url', 'age', case when v_p.id is null then null else date_part('year', age(v_p.birth_date))::int end, 'label', v_c.label, 'checked_in_at', now(), 'terminal', v_term);
end $$;

-- Canje en la barra con QR dinámico (perk o voucher de pedido). Las RPCs de abajo ya bloquean la fila (FOR UPDATE).
create or replace function public.redeem_dynamic_qr(p_event uuid, p_value text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_chk record; v_perk public.user_perks_qrs; v_order public.bar_orders;
begin
  select * into v_chk from public.verify_dynamic_qr(p_event, p_value);
  if v_chk.status = 'format' then raise exception 'invalid_qr'; end if;
  if v_chk.status <> 'ok' then raise exception 'qr_expired'; end if;
  if v_chk.kind = 'PERK' then
    select * into v_perk from public.user_perks_qrs where id = v_chk.ref::uuid and event_id = p_event;
    if v_perk.id is null then raise exception 'invalid_qr'; end if;
    select * into v_perk from public.redeem_perk(v_perk.qr_code_string);
    return jsonb_build_object('kind', 'PERK', 'id', v_perk.id);
  elsif v_chk.kind = 'ORDER' then
    if not public.event_feature(p_event, 'enableSmartBar') then raise exception 'feature_disabled'; end if;
    select * into v_order from public.bar_orders where id = v_chk.ref::uuid and event_id = p_event;
    if v_order.id is null or v_order.pickup_code is null then raise exception 'not_found'; end if;
    select * into v_order from public.redeem_pickup_code(p_event, v_order.pickup_code);
    return jsonb_build_object('kind', 'ORDER', 'id', v_order.id);
  end if;
  raise exception 'invalid_qr';
end $$;

-- Padrón para la puerta sin conexión (se guarda cifrado en el dispositivo). Dueño/a, producción y seguridad.
create or replace function public.door_roster(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'event_id', p_event, 'built_at', now(), 'qr_secret', public.event_qr_secret_of(p_event),
    'general', (select coalesce(jsonb_agg(encode(digest('rouge-door:' || p_event || ':' || upper(x), 'sha256'), 'hex')), '[]'::jsonb)
                  from (select slug as x from public.events where id = p_event union all select master_invite_code from public.events where id = p_event
                        union all select code from public.promoter_links where event_id = p_event) g),
    'codes', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'hash', encode(digest('rouge-door:' || p_event || ':' || upper(c.code), 'sha256'), 'hex'), 'label', c.label, 'user_id', c.used_by_user_id,
                'revoked', c.revoked_at is not null, 'checked_in_at', c.checked_in_at, 'holder', coalesce(c.holder_name, p.full_name),
                'search', lower(concat_ws(' ', c.holder_name, c.holder_dni, c.holder_email, p.full_name, p.username, c.code)),
                'late', case when l.free_until is not null and c.late_paid_at is null and l.late_price > 0
                             then jsonb_build_object('price', l.late_price, 'free_until', l.free_until, 'list', l.name) end)), '[]'::jsonb)
                from public.event_invite_codes c left join public.profiles p on p.id = c.used_by_user_id left join public.ticket_lists l on l.id = c.list_id
               where c.event_id = p_event),
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
                'user_id', a.user_id, 'name', p.full_name, 'username', p.username, 'photo', p.photos->0->>'url',
                'age', date_part('year', age(p.birth_date))::int, 'checked_in_at', a.checked_in_at,
                'banned', exists (select 1 from public.event_bans b where b.event_id = p_event and b.user_id = a.user_id))), '[]'::jsonb)
                from public.event_attendees a join public.profiles p on p.id = a.user_id where a.event_id = p_event));
end $$;

-- Reconciliación de la puerta sin conexión (espejo de reconcileOffline): aplica los ingresos encolados con su hora y
-- terminal; si otra terminal ya lo hizo entrar, lo devuelve como conflicto (doble uso).
create or replace function public.door_reconcile(p_event uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; v_at timestamptz; v_term text; v_applied int := 0; v_conf jsonb := '[]'::jsonb; v_att public.event_attendees; v_c public.event_invite_codes;
begin
  if not public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) order by (value->>'at') loop
    v_at := least(coalesce((it->>'at')::timestamptz, now()), now());
    v_term := left(nullif(trim(it->>'terminal'), ''), 40);
    if it->>'kind' = 'pass' then
      select * into v_att from public.event_attendees where event_id = p_event and user_id = (it->>'ref')::uuid for update;
      continue when v_att.id is null;
      if v_att.checked_in_at is not null and v_att.checked_in_terminal is distinct from v_term then
        v_conf := v_conf || jsonb_build_object('kind', 'pass', 'ref', it->>'ref', 'checked_in_at', v_att.checked_in_at, 'terminal', v_att.checked_in_terminal);
      elsif v_att.checked_in_at is null then
        update public.event_attendees set checked_in_at = v_at, checked_in_terminal = v_term where id = v_att.id; v_applied := v_applied + 1;
      end if;
    else
      select * into v_c from public.event_invite_codes where event_id = p_event and (upper(code) = upper(it->>'ref') or id::text = it->>'ref') for update;
      continue when v_c.id is null or v_c.revoked_at is not null;
      if v_c.checked_in_at is not null and v_c.checked_in_terminal is distinct from v_term then
        v_conf := v_conf || jsonb_build_object('kind', 'code', 'ref', it->>'ref', 'name', v_c.holder_name, 'checked_in_at', v_c.checked_in_at, 'terminal', v_c.checked_in_terminal);
      elsif v_c.checked_in_at is null then
        update public.event_invite_codes set checked_in_at = v_at, checked_in_by = auth.uid(), checked_in_terminal = v_term,
               late_paid_at = case when it->>'late_method' in ('cash','mercadopago','transfer') then v_at else late_paid_at end,
               late_payment_method = case when it->>'late_method' in ('cash','mercadopago','transfer') then it->>'late_method' else late_payment_method end
         where id = v_c.id;
        if v_c.used_by_user_id is not null then update public.event_attendees set checked_in_at = coalesce(checked_in_at, v_at), checked_in_terminal = coalesce(checked_in_terminal, v_term) where event_id = p_event and user_id = v_c.used_by_user_id; end if;
        v_applied := v_applied + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('applied', v_applied, 'conflicts', v_conf);
end $$;

-- [v1.7] Tablero minuto a minuto: curvas de 15' (ingresos en puerta y ventas de barra) de las últimas 4 fechas YA
-- terminadas de la misma organización, alineadas al inicio de cada evento (espejo de eventCurve). Dueño/a y producción.
create or replace function public.org_event_curves(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_org uuid;
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  select created_by into v_org from public.events where id = p_event;
  return coalesce((
    select jsonb_agg(jsonb_build_object('event_id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'points', (
      select coalesce(jsonb_agg(jsonb_build_object('m', g.m,
        'entries', (select count(*) from public.event_attendees a where a.event_id = e.id and a.checked_in_at >= e.starts_at + make_interval(mins => g.m) and a.checked_in_at < e.starts_at + make_interval(mins => g.m + 15)),
        'sales', (select coalesce(sum(o.total_amount), 0) from public.bar_orders o where o.event_id = e.id and o.payment_status <> 'awaiting_payment'
                    and coalesce(o.paid_at, o.created_at) >= e.starts_at + make_interval(mins => g.m) and coalesce(o.paid_at, o.created_at) < e.starts_at + make_interval(mins => g.m + 15))
      ) order by g.m), '[]'::jsonb)
      from generate_series(-60, (extract(epoch from (e.ends_at - e.starts_at)) / 60)::int, 15) as g(m)))
    order by e.starts_at desc)
    from (select * from public.events where created_by = v_org and id <> p_event and ends_at < now() order by starts_at desc limit 4) e), '[]'::jsonb);
end $$;

-- [v1.7] Base de clientes de la organización (todas sus fechas) para campañas. Teléfonos: solo dueño/a y producción.
create or replace function public.org_contacts(p_event uuid)
returns table (user_id uuid, full_name text, phone text, birth_date date, total_spent numeric, events_count int, last_event_at timestamptz, referred_by uuid)
language sql stable security definer set search_path = public, extensions as $$
  select a.user_id, p.full_name, p.phone_normalized, p.birth_date, sum(a.total_spent), count(distinct a.event_id)::int, max(e.starts_at),
         (array_agg(a.referred_by order by a.joined_at) filter (where a.referred_by is not null))[1]
  from public.event_attendees a
  join public.events e on e.id = a.event_id
  join public.profiles p on p.id = a.user_id
  where public.is_event_manager(p_event)
    and e.created_by = (select created_by from public.events where id = p_event)
  group by a.user_id, p.full_name, p.phone_normalized, p.birth_date;
$$;

alter table public.campaigns          enable row level security;
alter table public.campaign_contacts  enable row level security;
drop policy if exists campaigns_rw on public.campaigns;
create policy campaigns_rw on public.campaigns for all to authenticated
  using (event_id is not null and public.is_event_manager(event_id))
  with check (event_id is not null and public.is_event_manager(event_id) and organization_id = (select created_by from public.events where id = event_id));
drop policy if exists campaign_contacts_rw on public.campaign_contacts;
create policy campaign_contacts_rw on public.campaign_contacts for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_event_manager(c.event_id)))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_event_manager(c.event_id)));

-- [v1.7] CONSOLA GLOBAL (/superadmin): solo administradores de ROUGE (platform_admins). Espejo de engine/superadmin.ts.
create or replace function public.superadmin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(row_to_json(x) order by (x.phase = 'live') desc, x.inside desc), '[]'::jsonb) from (
      select e.id as event_id, e.name, e.venue_name as venue, coalesce(o.full_name, '—') as organization,
             case when now() < e.lobby_opens_at then 'upcoming' when now() >= e.lobby_expires_at then 'expired' when now() between e.starts_at and e.ends_at then 'live' else 'open' end as phase,
             (select count(distinct coalesce(a.user_id::text, c.id::text)) from public.event_invite_codes c full join public.event_attendees a on a.user_id = c.used_by_user_id and a.event_id = c.event_id
               where (c.event_id = e.id and c.checked_in_at is not null) or (a.event_id = e.id and a.checked_in_at is not null)) as inside,
             greatest((select count(*) from public.event_invite_codes c where c.event_id = e.id and c.revoked_at is null), (select count(*) from public.event_attendees a where a.event_id = e.id)) as sold,
             e.max_capacity as capacity,
             (select coalesce(sum(l.late_price), 0) from public.event_invite_codes c join public.ticket_lists l on l.id = c.list_id where c.event_id = e.id and c.late_paid_at is not null) as door_revenue,
             (select coalesce(sum(b.total_amount), 0) from public.bar_orders b where b.event_id = e.id and b.payment_status <> 'awaiting_payment') as bar_revenue,
             (select count(*) from public.event_staff s where s.event_id = e.id) + 1 as staff_active,
             (select count(*) from public.squad_members m join public.squads q on q.id = m.squad_id where q.event_id = e.id and m.safety_status = 'rescue_needed') as rescue_alerts,
             (select count(*) from public.user_reports r where r.event_id = e.id and r.status = 'open') as open_reports
      from public.events e left join public.profiles o on o.id = e.created_by
      where e.lobby_expires_at > now() - interval '30 days') x),
    'staff', (select coalesce(jsonb_agg(row_to_json(y)), '[]'::jsonb) from (
      select a.organization_id, coalesce(o.full_name, '—') as organization, a.user_id, a.role, 'assignment' as source, a.scope, a.event_ids,
             a.access_window, a.revoked_at, exists (select 1 from public.terminal_pins t where t.organization_id = a.organization_id and t.user_id = a.user_id) as has_pin
      from public.staff_assignments a left join public.profiles o on o.id = a.organization_id
      union all
      select e.created_by, coalesce(o.full_name, '—'), s.user_id, s.role, 'event', 'specific_events', array_agg(s.event_id), false, null,
             exists (select 1 from public.terminal_pins t where t.organization_id = e.created_by and t.user_id = s.user_id)
      from public.event_staff s join public.events e on e.id = s.event_id left join public.profiles o on o.id = e.created_by
      group by e.created_by, o.full_name, s.user_id, s.role) y));
end $$;

create or replace function public.superadmin_search(p_q text)
returns table (user_id uuid, full_name text, username text, event_id uuid, event_name text, checked_in_at timestamptz, visible_in_lobby boolean, bar_spent numeric, squad text, banned boolean, code_id uuid)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.full_name, p.username, e.id, e.name, a.checked_in_at,
         not a.ghost_mode and (not e.require_checkin_for_lobby or a.checked_in_at is not null), a.total_spent,
         (select q.name from public.squads q join public.squad_members m on m.squad_id = q.id where q.event_id = e.id and m.user_id = p.id and m.status = 'joined' limit 1),
         exists (select 1 from public.event_bans b where b.event_id = e.id and b.user_id = p.id),
         (select c.id from public.event_invite_codes c where c.event_id = e.id and c.used_by_user_id = p.id limit 1)
  from public.event_attendees a join public.profiles p on p.id = a.user_id join public.events e on e.id = a.event_id
  where public.is_platform_admin() and char_length(trim(p_q)) >= 2
    and (p.full_name ilike '%' || trim(p_q) || '%' or p.username ilike '%' || ltrim(trim(p_q), '@') || '%'
         or exists (select 1 from public.event_invite_codes c where c.event_id = e.id and c.used_by_user_id = p.id and upper(c.code) = upper(trim(p_q))))
  order by e.starts_at desc limit 30;
$$;

create or replace function public.sa_check_in(p_event uuid, p_user uuid) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  update public.event_attendees set checked_in_at = now(), checked_in_terminal = 'ROUGE HQ' where event_id = p_event and user_id = p_user and checked_in_at is null;
  if not found then raise exception 'not_allowed'; end if;
  perform public.write_audit((select created_by from public.events where id = p_event), p_event, 'door.check_in', p_user::text, '{"by":"superadmin"}'::jsonb);
end $$;

create or replace function public.sa_hide_from_lobby(p_event uuid, p_user uuid) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  update public.event_attendees set ghost_mode = true where event_id = p_event and user_id = p_user;
  perform public.write_audit((select created_by from public.events where id = p_event), p_event, 'attendee.removed', p_user::text, '{"hidden_from_lobby":true}'::jsonb);
end $$;

create or replace function public.sa_remove_attendee(p_event uuid, p_user uuid, p_ban boolean default false) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  delete from public.squad_members m using public.squads q where q.id = m.squad_id and q.event_id = p_event and m.user_id = p_user;
  delete from public.map_pins where event_id = p_event and user_id = p_user;
  delete from public.event_attendees where event_id = p_event and user_id = p_user;
  if p_ban then insert into public.event_bans (event_id, user_id, banned_by, reason) values (p_event, p_user, auth.uid(), 'ROUGE HQ') on conflict do nothing; end if;
  perform public.write_audit((select created_by from public.events where id = p_event), p_event, 'attendee.removed', p_user::text, jsonb_build_object('ban', p_ban, 'by', 'superadmin'));
end $$;

create or replace function public.sa_revoke_code(p_code uuid) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  update public.event_invite_codes set revoked_at = now() where id = p_code and revoked_at is null;
end $$;

create or replace function public.sa_revoke_staff(p_org uuid, p_user uuid) returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_a int; v_s int;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  update public.staff_assignments set revoked_at = now() where organization_id = p_org and user_id = p_user and revoked_at is null;
  get diagnostics v_a = row_count;
  delete from public.event_staff es using public.events e where e.id = es.event_id and e.created_by = p_org and es.user_id = p_user and es.user_id <> e.created_by;
  get diagnostics v_s = row_count;
  delete from public.terminal_pins where organization_id = p_org and user_id = p_user;
  if v_a + v_s = 0 then raise exception 'not_staff'; end if;
  perform public.write_audit(p_org, null, 'staff.revoked', p_user::text, jsonb_build_object('by', 'superadmin', 'removed', v_a + v_s));
  return v_a + v_s;
end $$;

-- Invitar un trago desde el chat 1:1 (espejo de giftDrinkInChat). Precio del menú del servidor. Con cobro online el
-- QR se emite al acreditarse el pago (confirm_order_payment); si no, al instante.
create or replace function public.gift_drink(p_connection uuid, p_item text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_c public.connections; v_to uuid; v_item public.bar_menu_items; v_online boolean; v_order uuid; v_perk uuid; v_name text;
begin
  select * into v_c from public.connections where id = p_connection and status = 'accepted' and (sender_id = auth.uid() or receiver_id = auth.uid());
  if v_c.id is null then raise exception 'unavailable'; end if;
  if not public.event_feature(v_c.event_id, 'enableChatDrinkGifting') then raise exception 'feature_disabled'; end if;
  v_to := case when v_c.sender_id = auth.uid() then v_c.receiver_id else v_c.sender_id end;
  if public.is_blocked(auth.uid(), v_to) then raise exception 'unavailable'; end if;
  if not public.lobby_is_open(v_c.event_id) then raise exception 'lobby_closed'; end if;
  if not public.is_event_attendee(v_c.event_id, v_to) then raise exception 'not_attendee'; end if;
  select * into v_item from public.bar_menu_items where event_id = v_c.event_id and id = p_item and is_available and category in ('trago','cerveza','sin_alcohol');
  if v_item.id is null then raise exception 'invalid_item'; end if;
  select coalesce(b.payments_enabled, false) into v_online from public.events e left join public.brands b on b.id = e.brand_id where e.id = v_c.event_id;
  select split_part(full_name, ' ', 1) into v_name from public.profiles where id = auth.uid();
  insert into public.bar_orders (event_id, user_id, delivery_type, items_json, total_amount, status, payment_status, gift_to)
  values (v_c.event_id, auth.uid(), 'icebreaker_gift', jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'name', v_item.name, 'qty', 1, 'unit_price', v_item.price)),
          v_item.price, 'completed', case when v_online then 'awaiting_payment' else 'pay_at_bar' end, v_to)
  returning id into v_order;
  if not v_online then
    insert into public.user_perks_qrs (event_id, user_id, title, perk_type, source, source_ref_id)
    values (v_c.event_id, v_to, v_item.emoji || ' ' || v_item.name || ' — te lo invitó ' || coalesce(v_name, 'tu match'), 'gifted_drink', 'manual', v_order) returning id into v_perk;
    update public.event_attendees set total_spent = total_spent + v_item.price where event_id = v_c.event_id and user_id = auth.uid();
  end if;
  insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content)
  values (v_c.event_id, 'direct', v_c.id, auth.uid(), 'system_alert',
          case when v_online then '🎁 Te está invitando un ' || v_item.name || ' (se confirma con el pago).' else '🎁 Te invitó un ' || v_item.name || ': el QR está en tus Perks para retirarlo en la barra.' end);
  return jsonb_build_object('order_id', v_order, 'perk_id', v_perk, 'awaiting_payment', v_online);
end $$;

-- Mesa VIP dividida: precio de una botella/mesa del menú, una cuota por integrante (los primeros absorben el resto).
create or replace function public.create_vip_reservation(p_squad uuid, p_item text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_sq public.squads; v_item public.bar_menu_items; v_online boolean; v_res uuid; v_n int; v_base numeric; v_rest numeric; r record; i int := 0;
begin
  select * into v_sq from public.squads where id = p_squad;
  if v_sq.id is null or not public.is_squad_member(p_squad) then raise exception 'not_member'; end if;
  if not public.event_feature(v_sq.event_id, 'enableSquadBillSplit') then raise exception 'feature_disabled'; end if;
  if not public.event_feature(v_sq.event_id, 'enableSmartBar') then raise exception 'feature_disabled'; end if;
  if not public.lobby_is_open(v_sq.event_id) then raise exception 'lobby_closed'; end if;
  select count(*) into v_n from public.squad_members where squad_id = p_squad and status = 'joined';
  if v_n < 2 then raise exception 'not_allowed'; end if;
  select * into v_item from public.bar_menu_items where event_id = v_sq.event_id and id = p_item and is_available and category = 'botella';
  if v_item.id is null then raise exception 'invalid_item'; end if;
  select coalesce(b.payments_enabled, false) into v_online from public.events e left join public.brands b on b.id = e.brand_id where e.id = v_sq.event_id;
  insert into public.vip_reservations (event_id, squad_id, item_id, label, total_amount, created_by)
  values (v_sq.event_id, p_squad, v_item.id, v_item.name, v_item.price, auth.uid()) returning id into v_res;
  v_base := floor(v_item.price / v_n); v_rest := v_item.price - v_base * v_n;
  for r in select user_id from public.squad_members where squad_id = p_squad and status = 'joined' order by joined_at loop
    i := i + 1;
    insert into public.bar_orders (event_id, user_id, squad_id, delivery_type, items_json, total_amount, status, payment_status, vip_reservation_id)
    values (v_sq.event_id, r.user_id, p_squad, 'squad_split',
            jsonb_build_array(jsonb_build_object('item_id', v_item.id, 'name', v_item.name || ' · parte ' || i || '/' || v_n, 'qty', 1, 'unit_price', v_base + case when i <= v_rest then 1 else 0 end)),
            v_base + case when i <= v_rest then 1 else 0 end, 'completed', case when v_online then 'awaiting_payment' else 'pay_at_bar' end, v_res);
  end loop;
  return v_res;
end $$;

alter table public.vip_reservations enable row level security;
drop policy if exists vip_reservations_select on public.vip_reservations;
create policy vip_reservations_select on public.vip_reservations for select to authenticated using (public.is_squad_member(squad_id) or public.is_event_staff(event_id));

-- Normaliza los flags con las dependencias (se guardan ya resueltos).
create or replace function public.resolve_features(p jsonb)
returns jsonb language plpgsql immutable set search_path = public, extensions as $$
declare k text; out jsonb := '{}'::jsonb;
begin
  foreach k in array array['enableTicketing','enableRrpp','enableFreeCutoffConversion','enableSocialLobby','enableDirectChat','enableLiveWall',
                           'enablePostPartyRecap','enableSquads','enableSquadBillSplit','enableVenueMap','enableSmartBar','enableChatDrinkGifting','enablePerks'] loop
    out := out || jsonb_build_object(k, coalesce((p->>k)::boolean, true));
  end loop;
  if not (out->>'enableTicketing')::boolean then out := out || '{"enableFreeCutoffConversion":false}'; end if;
  if not (out->>'enableSquads')::boolean then out := out || '{"enableSquadBillSplit":false}'; end if;
  if not ((out->>'enableSmartBar')::boolean and (out->>'enableDirectChat')::boolean) then out := out || '{"enableChatDrinkGifting":false}'; end if;
  return out;
end $$;

-- Crea o edita un evento desde el creador modular (espejo de saveEventFromBuilder). Devuelve el id.
create or replace function public.builder_save_event(p_event jsonb, p_lists jsonb default '[]'::jsonb, p_menu jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := nullif(p_event->>'id', '')::uuid; v_org uuid := (p_event->>'organization_id')::uuid; v_old public.events; l jsonb;
begin
  if v_id is not null then select * into v_old from public.events where id = v_id for update; end if;
  if v_old.id is not null then
    if not public.can_manage_modules(v_old.created_by) then raise exception 'forbidden'; end if;
    if v_org <> v_old.created_by and not public.is_platform_admin() then raise exception 'forbidden'; end if;
  elsif not public.can_manage_modules(v_org) then raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.profiles where id = v_org) then raise exception 'not_found'; end if;
  if v_old.id is null then
    insert into public.events (id, slug, name, description, venue_name, starts_at, ends_at, lobby_opens_at, lobby_expires_at, max_capacity,
                               lineup_json, brand_id, logo_url, theme_primary, theme_accent, features, lifecycle_status, created_by)
    values (coalesce(v_id, gen_random_uuid()), lower(p_event->>'slug'), p_event->>'name', coalesce(p_event->>'description', ''), coalesce(p_event->>'venue_name', ''),
            (p_event->>'starts_at')::timestamptz, (p_event->>'ends_at')::timestamptz,
            coalesce((p_event->>'lobby_opens_at')::timestamptz, (p_event->>'starts_at')::timestamptz - interval '48 hours'),
            coalesce((p_event->>'lobby_expires_at')::timestamptz, (p_event->>'ends_at')::timestamptz + interval '24 hours'),
            coalesce((p_event->>'max_capacity')::int, 1000), coalesce(p_event->'lineup_json', '[]'::jsonb), nullif(p_event->>'brand_id', '')::uuid,
            p_event->>'logo_url', p_event->>'theme_primary', p_event->>'theme_accent', public.resolve_features(p_event->'features'),
            coalesce(p_event->>'lifecycle_status', 'draft'), v_org)
    returning id into v_id;
    insert into public.bar_menu_items (id, event_id, name, category, price, emoji)
    select m->>'id', v_id, m->>'name', m->>'category', (m->>'price')::numeric, coalesce(m->>'emoji', '🍸') from jsonb_array_elements(coalesce(p_menu, '[]'::jsonb)) m
    on conflict do nothing;
  else
    update public.events set slug = lower(p_event->>'slug'), name = p_event->>'name', description = coalesce(p_event->>'description', ''),
      venue_name = coalesce(p_event->>'venue_name', venue_name), starts_at = (p_event->>'starts_at')::timestamptz, ends_at = (p_event->>'ends_at')::timestamptz,
      lobby_opens_at = coalesce((p_event->>'lobby_opens_at')::timestamptz, lobby_opens_at), lobby_expires_at = coalesce((p_event->>'lobby_expires_at')::timestamptz, lobby_expires_at),
      max_capacity = coalesce((p_event->>'max_capacity')::int, max_capacity), lineup_json = coalesce(p_event->'lineup_json', lineup_json),
      brand_id = nullif(p_event->>'brand_id', '')::uuid, logo_url = p_event->>'logo_url', theme_primary = p_event->>'theme_primary', theme_accent = p_event->>'theme_accent',
      features = public.resolve_features(p_event->'features'), lifecycle_status = coalesce(p_event->>'lifecycle_status', lifecycle_status), created_by = v_org
    where id = v_id;
  end if;
  for l in select value from jsonb_array_elements(coalesce(p_lists, '[]'::jsonb)) loop
    insert into public.ticket_lists (id, event_id, name, free_until, late_price)
    values (coalesce(nullif(l->>'id', '')::uuid, gen_random_uuid()), v_id, l->>'name', (l->>'free_until')::timestamptz, coalesce((l->>'late_price')::numeric, 0))
    on conflict (id) do update set name = excluded.name, free_until = excluded.free_until, late_price = excluded.late_price where ticket_lists.event_id = v_id;
  end loop;
  perform public.write_audit(v_org, v_id, case when v_old.id is null then 'event.created' else 'event.updated' end, v_id::text,
                             jsonb_build_object('lifecycle', coalesce(p_event->>'lifecycle_status', 'draft')));
  return v_id;
end $$;

-- Prender / apagar módulos de un evento en vivo.
create or replace function public.set_event_features(p_event uuid, p_features jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v jsonb := public.resolve_features(p_features);
begin
  select created_by into v_org from public.events where id = p_event;
  if v_org is null or not public.can_manage_modules(v_org) then raise exception 'forbidden'; end if;
  update public.events set features = v where id = p_event;
  perform public.write_audit(v_org, p_event, 'event.modules_changed', p_event::text, v);
  return v;
end $$;

-- ROUGE HQ habilita la autogestión (el dueño/a usa el mismo creador desde /admin/events).
create or replace function public.sa_set_owner_self_service(p_org uuid, p_allow boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.organization_settings (organization_id, allow_owner_self_service) values (p_org, p_allow)
  on conflict (organization_id) do update set allow_owner_self_service = excluded.allow_owner_self_service, updated_at = now();
end $$;

alter table public.organization_settings enable row level security;
drop policy if exists org_settings_select on public.organization_settings;
create policy org_settings_select on public.organization_settings for select to authenticated using (organization_id = auth.uid() or public.is_platform_admin());

-- RLS de listas: gestor (dueño/a, producción) administra; puerta las ve.
alter table public.event_secrets enable row level security;
alter table public.ticket_lists  enable row level security;
drop policy if exists ticket_lists_select on public.ticket_lists;
create policy ticket_lists_select on public.ticket_lists for select to authenticated using (public.has_staff_role(event_id, array['owner','manager','security']::staff_role_t[]));
drop policy if exists ticket_lists_write on public.ticket_lists;
create policy ticket_lists_write on public.ticket_lists for all to authenticated using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));

create or replace function public.door_check_in(p_event uuid, p_value text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  -- [v1.7] Compatibilidad: la lógica vive en door_scan (QR dinámico, terminal, listas free).
  select public.door_scan(p_event, p_value, null);
$$;

-- ════════════════════════════════════════════════════════════════════════
-- [v1.7] SEGURIDAD OPERATIVA — RLS y RPCs (espejo de src/lib/engine/security.ts)
-- ════════════════════════════════════════════════════════════════════════
alter table public.platform_admins     enable row level security;
alter table public.staff_assignments   enable row level security;
alter table public.staff_invites       enable row level security;
alter table public.terminal_pins       enable row level security;   -- sin políticas: solo RPCs
alter table public.audit_log           enable row level security;
alter table public.user_reports        enable row level security;
alter table public.withdrawal_requests enable row level security;   -- sin políticas: solo el servidor

drop policy if exists staff_assignments_select on public.staff_assignments;
create policy staff_assignments_select on public.staff_assignments for select to authenticated
  using (user_id = auth.uid() or organization_id = auth.uid() or public.is_platform_admin());
drop policy if exists staff_invites_select on public.staff_invites;
create policy staff_invites_select on public.staff_invites for select to authenticated using (organization_id = auth.uid());
revoke all on public.staff_invites from anon, authenticated;
grant select (id, organization_id, role, scope, event_ids, access_window, expires_at, used_at, used_by, revoked_at, created_by, created_at)
  on public.staff_invites to authenticated;

-- Auditoría: el dueño/a ve la de su organización; producción, la de los eventos que produce; ROUGE, todo.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (organization_id = auth.uid() or (event_id is not null and public.is_event_manager(event_id)) or public.is_platform_admin());
revoke insert, update, delete on public.audit_log from anon, authenticated;
create or replace function public.audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log_is_append_only'; end $$;
drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log for each row execute function public.audit_log_immutable();

create or replace function public.write_audit(p_org uuid, p_event uuid, p_action text, p_target text, p_details jsonb default '{}'::jsonb, p_operator uuid default null)
returns void language sql security definer set search_path = public, extensions as $$
  insert into public.audit_log (organization_id, event_id, actor_id, operator_id, action, target, details)
  values (p_org, p_event, auth.uid(), p_operator, p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;

-- Reportes: quien reporta ve los suyos; seguridad, dueño/a y producción, los del evento.
drop policy if exists reports_select on public.user_reports;
create policy reports_select on public.user_reports for select to authenticated
  using (reporter_id = auth.uid() or (event_id is not null and public.has_staff_role(event_id, array['owner','manager','security']::staff_role_t[])) or public.is_platform_admin());

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.am_platform_admin() returns boolean language sql stable security definer set search_path = public, extensions as $$
  select public.is_platform_admin(auth.uid());
$$;

-- Invitación de staff (dueño/a). Devuelve el token UNA vez; se guarda su hash (mismo formato que inviteTokenHash).
create or replace function public.create_staff_invite(p_role staff_role_t, p_scope text, p_event_ids uuid[] default '{}', p_access_window boolean default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_'); v_id uuid; v_ids uuid[] := coalesce(p_event_ids, '{}');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_role::text = 'owner' then raise exception 'invalid_role'; end if;
  if p_scope not in ('all_org_events','specific_events') then raise exception 'invalid_scope'; end if;
  if not exists (select 1 from public.events where created_by = auth.uid()) then raise exception 'no_org_events'; end if;
  if p_scope = 'specific_events' and (cardinality(v_ids) = 0 or exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.events e where e.id = x and e.created_by = auth.uid()))) then
    raise exception 'event_not_in_org';
  end if;
  insert into public.staff_invites (organization_id, role, scope, event_ids, access_window, token_hash, expires_at, created_by)
  values (auth.uid(), p_role, p_scope, case when p_scope = 'specific_events' then v_ids else '{}' end,
          coalesce(p_access_window, p_role::text in ('security','bartender','waiter')),
          encode(digest('rouge-staff-invite:' || v_token, 'sha256'), 'hex'), now() + interval '2 hours', auth.uid())
  returning id into v_id;
  perform public.write_audit(auth.uid(), null, 'staff.invited', v_id::text, jsonb_build_object('role', p_role, 'scope', p_scope, 'events', cardinality(v_ids)));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Aceptar (quien abre el link, con sesión y perfil). Atómico: el FOR UPDATE evita que dos personas usen el mismo link.
create or replace function public.accept_staff_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_inv public.staff_invites; v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'profile_required'; end if;
  select * into v_inv from public.staff_invites where token_hash = encode(digest('rouge-staff-invite:' || coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if v_inv.id is null then raise exception 'invite_missing'; end if;
  if v_inv.revoked_at is not null then raise exception 'invite_revoked'; end if;
  if v_inv.used_at is not null then raise exception 'invite_used'; end if;
  if v_inv.expires_at <= now() then raise exception 'invite_expired'; end if;
  if v_inv.organization_id = auth.uid() then raise exception 'invite_self'; end if;
  update public.staff_assignments set revoked_at = now() where organization_id = v_inv.organization_id and user_id = auth.uid() and revoked_at is null;
  insert into public.staff_assignments (organization_id, user_id, role, scope, event_ids, access_window, created_by)
  values (v_inv.organization_id, auth.uid(), v_inv.role, v_inv.scope, v_inv.event_ids, v_inv.access_window, v_inv.created_by)
  returning id into v_id;
  update public.staff_invites set used_at = now(), used_by = auth.uid() where id = v_inv.id;
  perform public.write_audit(v_inv.organization_id, null, 'staff.joined', auth.uid()::text, jsonb_build_object('role', v_inv.role, 'scope', v_inv.scope));
  return jsonb_build_object('id', v_id, 'organization_id', v_inv.organization_id, 'role', v_inv.role);
end $$;

create or replace function public.revoke_staff_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.staff_invites set revoked_at = now() where id = p_invite and organization_id = auth.uid() and used_at is null and revoked_at is null;
  if not found then raise exception 'forbidden'; end if;
end $$;

-- Kill switch: baja inmediata en toda la organización (asignaciones + equipo de cada evento + PIN).
create or replace function public.revoke_staff_access(p_user uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_a int; v_s int;
begin
  if p_user = auth.uid() then raise exception 'staff_is_creator'; end if;
  update public.staff_assignments set revoked_at = now() where organization_id = auth.uid() and user_id = p_user and revoked_at is null;
  get diagnostics v_a = row_count;
  delete from public.event_staff es using public.events e where e.id = es.event_id and e.created_by = auth.uid() and es.user_id = p_user;
  get diagnostics v_s = row_count;
  delete from public.terminal_pins where organization_id = auth.uid() and user_id = p_user;
  if v_a + v_s = 0 then raise exception 'not_staff'; end if;
  perform public.write_audit(auth.uid(), null, 'staff.revoked', p_user::text, jsonb_build_object('removed', v_a + v_s));
  return v_a + v_s;
end $$;

-- PIN de terminal (4-6 dígitos, no trivial): bcrypt. Solo staff de esa organización.
create or replace function public.set_terminal_pin(p_org uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'pin_format'; end if;
  if p_pin ~ '^(.)\1+$' or position(p_pin in '01234567890123456789') > 0 or position(p_pin in '98765432109876543210') > 0 then raise exception 'pin_weak'; end if;
  if not (p_org = auth.uid()
          or exists (select 1 from public.staff_assignments where organization_id = p_org and user_id = auth.uid() and revoked_at is null)
          or exists (select 1 from public.event_staff es join public.events e on e.id = es.event_id where e.created_by = p_org and es.user_id = auth.uid())) then
    raise exception 'not_staff';
  end if;
  insert into public.terminal_pins (organization_id, user_id, pin_hash) values (p_org, auth.uid(), crypt(p_pin, gen_salt('bf', 8)))
  on conflict (organization_id, user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
  perform public.write_audit(p_org, null, 'staff.pin_set', auth.uid()::text);
end $$;

create or replace function public.my_terminal_pins()
returns table (organization_id uuid, user_id uuid, updated_at timestamptz) language sql stable security definer set search_path = public, extensions as $$
  select organization_id, user_id, updated_at from public.terminal_pins where user_id = auth.uid() or organization_id = auth.uid();
$$;

-- Modo Kiosco: la terminal (cuenta del dueño/a o producción) desbloquea con el PIN de quien opera.
-- 5 errores en 5 minutos bloquean la terminal. Devuelve quién opera (para la auditoría de cada acción).
create or replace function public.kiosk_unlock(p_event uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_user uuid; v_role staff_role_t;
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  select created_by into v_org from public.events where id = p_event;
  if (select count(*) from public.audit_log where event_id = p_event and actor_id = auth.uid() and action = 'kiosk.failed' and created_at > now() - interval '5 minutes') >= 5 then
    raise exception 'kiosk_locked';
  end if;
  select tp.user_id into v_user from public.terminal_pins tp
   where tp.organization_id = v_org and coalesce(p_pin, '') ~ '^[0-9]{4,6}$' and tp.pin_hash = crypt(p_pin, tp.pin_hash) limit 1;
  if v_user is not null then
    v_role := coalesce((select role from public.event_staff where event_id = p_event and user_id = v_user),
                       case when v_user = v_org then 'owner'::staff_role_t end, public.assigned_staff_role(p_event, v_user));
  end if;
  if v_user is null or v_role is null then
    perform public.write_audit(v_org, p_event, 'kiosk.failed', null);
    raise exception 'kiosk_bad_pin';
  end if;
  perform public.write_audit(v_org, p_event, 'kiosk.unlocked', v_user::text, '{}'::jsonb, v_user);
  return jsonb_build_object('operator_id', v_user, 'role', v_role);
end $$;

-- Acción hecha en kiosco: deja en la auditoría quién operó (la terminal es la cuenta del dueño/a o producción).
create or replace function public.kiosk_audit(p_event uuid, p_operator uuid, p_action text, p_target text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  if p_action not in ('door.check_in','door.rejected','bar.delivered','perk.redeemed') then raise exception 'invalid_action'; end if;
  if not exists (select 1 from public.audit_log where event_id = p_event and actor_id = auth.uid() and operator_id = p_operator and action = 'kiosk.unlocked' and created_at > now() - interval '12 hours') then
    raise exception 'kiosk_not_unlocked';
  end if;
  perform public.write_audit((select created_by from public.events where id = p_event), p_event, p_action, p_target, '{}'::jsonb, p_operator);
end $$;

-- Reportar (con bloqueo opcional en el mismo paso: invisibilidad mutua inmediata).
create or replace function public.report_user(p_reported uuid, p_event uuid, p_reason text, p_details text default '', p_block boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_reported = auth.uid() then raise exception 'report_self'; end if;
  insert into public.user_reports (event_id, reporter_id, reported_user_id, reason, details)
  values (p_event, auth.uid(), p_reported, p_reason, left(coalesce(trim(p_details), ''), 280)) returning id into v_id;
  if p_block then
    insert into public.user_blocks (blocker_id, blocked_user_id) select auth.uid(), p_reported
    where not exists (select 1 from public.user_blocks where blocker_id = auth.uid() and blocked_user_id = p_reported);
  end if;
  perform public.write_audit((select created_by from public.events where id = p_event), p_event, 'report.created', v_id::text, jsonb_build_object('reason', p_reason));
  return v_id;
exception when unique_violation then raise exception 'report_duplicate';
end $$;

create or replace function public.review_report(p_report uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_event uuid;
begin
  select event_id into v_event from public.user_reports where id = p_report;
  if v_event is null or not public.has_staff_role(v_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  update public.user_reports set status = 'reviewed', reviewed_by = auth.uid() where id = p_report;
end $$;

-- Borrado REAL de la cuenta (derecho de supresión). Los pedidos pagados quedan anonimizados (contabilidad).
-- El usuario de Auth lo borra el servidor (/api/account) con service role después de esta RPC.
create or replace function public.delete_my_account(p_confirm_username text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_me public.profiles;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.id is null then raise exception 'profile_missing'; end if;
  if lower(ltrim(trim(p_confirm_username), '@')) <> v_me.username then raise exception 'confirm_mismatch'; end if;
  if exists (select 1 from public.events e join public.event_attendees a on a.event_id = e.id where e.created_by = auth.uid()) then raise exception 'owns_live_events'; end if;
  update public.bar_orders set user_id = null where user_id = auth.uid() and payment_status = 'paid';
  delete from public.instagram_accounts where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();   -- on delete cascade: asistencias, conexiones, mensajes, pines, squads…
  perform public.write_audit(null, null, 'account.deleted', null);
end $$;

-- Botón de Arrepentimiento: alta anónima, devuelve el código de seguimiento.
create or replace function public.request_withdrawal(p_email text, p_order_ref text default null, p_reason text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := 'ARR-' || upper(encode(gen_random_bytes(4), 'hex'));
begin
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  insert into public.withdrawal_requests (tracking, email, order_ref, reason) values (v_code, lower(trim(p_email)), nullif(trim(p_order_ref), ''), nullif(trim(p_reason), ''));
  return v_code;
end $$;

-- Cada evento nuevo nace con su secreto de QR dinámicos.
create or replace function public.event_secret_on_insert() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin insert into public.event_secrets (event_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists events_qr_secret on public.events;
create trigger events_qr_secret after insert on public.events for each row execute function public.event_secret_on_insert();

-- Auditoría automática (no se puede saltear desde el cliente): cambios de precio y anulaciones de entradas.
create or replace function public.audit_menu_price() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.price is distinct from old.price then
    insert into public.audit_log (organization_id, event_id, actor_id, action, target, details)
    values ((select created_by from public.events where id = new.event_id), new.event_id, auth.uid(), 'menu.price_changed', new.id,
            jsonb_build_object('from', old.price, 'to', new.price));
  end if;
  return new;
end $$;
drop trigger if exists bar_menu_price_audit on public.bar_menu_items;
create trigger bar_menu_price_audit after update on public.bar_menu_items for each row execute function public.audit_menu_price();

create or replace function public.audit_code_revoked() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    insert into public.audit_log (organization_id, event_id, actor_id, action, target)
    values ((select created_by from public.events where id = new.event_id), new.event_id, auth.uid(), 'code.revoked', new.code);
  end if;
  return new;
end $$;
drop trigger if exists invite_code_revoked_audit on public.event_invite_codes;
create trigger invite_code_revoked_audit after update on public.event_invite_codes for each row execute function public.audit_code_revoked();

create or replace function public.audit_staff_change() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.audit_log (organization_id, event_id, actor_id, action, target, details)
  values ((select created_by from public.events where id = coalesce(new.event_id, old.event_id)), coalesce(new.event_id, old.event_id), auth.uid(),
          case when tg_op = 'DELETE' then 'staff.revoked' else 'staff.role_changed' end, coalesce(new.user_id, old.user_id)::text,
          jsonb_build_object('role', coalesce(new.role::text, old.role::text)));
  return coalesce(new, old);
end $$;
drop trigger if exists event_staff_audit on public.event_staff;
create trigger event_staff_audit after insert or update or delete on public.event_staff for each row execute function public.audit_staff_change();

-- Permisos de ejecución
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
-- Postgres concede EXECUTE a PUBLIC por defecto: las funciones internas se cierran también para PUBLIC.
revoke execute on function public.purge_expired_pins() from public, anon, authenticated;
revoke execute on function public.apply_squad_perk_rules(uuid) from public, anon, authenticated;
revoke execute on function public.apply_order_spend(public.bar_orders) from public, anon, authenticated;
grant execute on function public.resolve_access_code(text) to anon;
grant execute on function public.request_withdrawal(text, text, text) to anon;
revoke execute on function public.write_audit(uuid, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
-- Secretos de QR: internos (si fueran ejecutables, cualquiera podría fabricar el QR de otra persona).
revoke execute on function public.event_qr_secret_of(uuid) from public, anon, authenticated;
revoke execute on function public.qr_credential_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.verify_dynamic_qr(uuid, text) from public, anon, authenticated;
-- API v1: solo el servidor (route handlers con service role) usa estas funciones.
do $$ declare f text; begin
  foreach f in array array['public.api_authorize(uuid, uuid, text)', 'public.api_key_events(uuid)',
                           'public.api_issue_codes(uuid, uuid, int, jsonb, text)', 'public.api_revoke_code(uuid, uuid, text)',
                           'public.confirm_order_payment(uuid, text, numeric)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- REALTIME (chat, pines, alertas, blasts, comandas)
-- ════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['messages','map_pins','connections','squad_members','squads','blast_deliveries',
                           'user_perks_qrs','bar_orders','song_requests','raffles','event_attendees',
                           'brands','squad_expenses','squad_settlements','user_reports','staff_assignments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- STORAGE (imágenes ya comprimidas en cliente con browser-image-compression)
--   profile-media/{user_id}/...   público (fotos + loop de perfil)
--   venue-maps/{event_id}/...     público (planos)
--   chat-media/{user_id}/...      privado (fotos del chat, URLs firmadas)
-- ════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('profile-media', 'profile-media', true,  5242880,  array['image/webp','image/jpeg','image/png','video/mp4','video/webm']),
  ('venue-maps',    'venue-maps',    true,  8388608,  array['image/webp','image/jpeg','image/png','image/svg+xml']),
  ('chat-media',    'chat-media',    false, 3145728,  array['image/webp','image/jpeg','image/png','audio/webm','audio/mp4','video/mp4'])
on conflict (id) do nothing;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects for select using (bucket_id in ('profile-media','venue-maps'));
drop policy if exists "media_owner_write" on storage.objects;
create policy "media_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id in ('profile-media','chat-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media_owner_delete" on storage.objects;
create policy "media_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('profile-media','chat-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "chat_media_read" on storage.objects;
create policy "chat_media_read" on storage.objects for select to authenticated using (bucket_id = 'chat-media');
drop policy if exists "venue_maps_staff_write" on storage.objects;
create policy "venue_maps_staff_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'venue-maps' and public.is_event_manager(((storage.foldername(name))[1])::uuid));
