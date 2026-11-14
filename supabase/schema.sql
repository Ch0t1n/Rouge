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

create extension if not exists pgcrypto;   -- gen_random_uuid(), gen_random_bytes()
create extension if not exists citext;     -- usernames case-insensitive

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
returns boolean language sql stable security definer set search_path = public as $$
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
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_attendees where event_id = p_event and user_id = p_user);
$$;

create or replace function public.is_event_staff(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user)
      or exists (select 1 from public.events where id = p_event and created_by = p_user);
$$;

create or replace function public.is_squad_member(p_squad uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.squad_members where squad_id = p_squad and user_id = p_user and status = 'joined');
$$;

create or replace function public.user_squad(p_event uuid, p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select sm.squad_id from public.squad_members sm
  join public.squads s on s.id = sm.squad_id
  where s.event_id = p_event and sm.user_id = p_user and sm.status = 'joined'
  limit 1;
$$;

create or replace function public.are_squadmates(p_event uuid, a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_squad(p_event, a) is not null and public.user_squad(p_event, a) = public.user_squad(p_event, b);
$$;

create or replace function public.is_match(p_event uuid, a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted' and (p_event is null or event_id = p_event)
      and ((sender_id = a and receiver_id = b) or (sender_id = b and receiver_id = a))
  );
$$;

create or replace function public.lobby_is_open(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events where id = p_event and now() >= lobby_opens_at and now() < lobby_expires_at);
$$;

-- Regla de visibilidad de pines (sin difusión implícita a matches).
create or replace function public.can_see_pin(p public.map_pins, viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
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

-- PROFILES ── el teléfono NUNCA es legible por otros usuarios (column privileges).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_blocked(auth.uid(), id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select (id, username, full_name, birth_date, gender, bio, photos, loop_video_url, music_genres, spotify_embed_url, is_verified, created_at)
  on public.profiles to authenticated;
-- is_verified solo lo modifica el staff de ROUGE (service role)
grant insert (id, username, full_name, birth_date, gender, phone_normalized, bio, photos, loop_video_url, music_genres, spotify_embed_url)
  on public.profiles to authenticated;
grant update (username, full_name, birth_date, gender, phone_normalized, bio, photos, loop_video_url, music_genres, spotify_embed_url)
  on public.profiles to authenticated;

-- Mi perfil completo (incluye mi teléfono)
create or replace function public.my_profile()
returns setof public.profiles language sql stable security definer set search_path = public as $$
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
create policy events_insert on public.events for insert to authenticated with check (created_by = auth.uid());
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated using (public.is_event_staff(id)) with check (public.is_event_staff(id));
-- El código maestro no se expone a anónimos (la landing /join solo necesita datos públicos)
revoke all on public.events from anon;
grant select (id, slug, name, description, venue_name, cover_url, starts_at, ends_at, lobby_opens_at, lobby_expires_at, max_capacity)
  on public.events to anon;

drop policy if exists staff_select on public.event_staff;
create policy staff_select on public.event_staff for select to authenticated using (user_id = auth.uid() or public.is_event_staff(event_id));
drop policy if exists staff_manage on public.event_staff;
create policy staff_manage on public.event_staff for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.created_by = auth.uid()));

-- INVITE CODES ── solo staff (el canje va por la RPC join_event).
drop policy if exists codes_staff on public.event_invite_codes;
create policy codes_staff on public.event_invite_codes for all to authenticated
  using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

-- ATTENDEES ── veo a los asistentes de mis eventos sin bloqueo; ghost solo para mí, mi squad y mis matches.
drop policy if exists attendees_select on public.event_attendees;
create policy attendees_select on public.event_attendees for select to authenticated using (
  user_id = auth.uid()
  or public.is_event_staff(event_id)
  or (
    public.is_event_attendee(event_id)
    and not public.is_blocked(auth.uid(), user_id)
    and (not ghost_mode or public.are_squadmates(event_id, auth.uid(), user_id) or public.is_match(event_id, auth.uid(), user_id))
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
  using (user_id = auth.uid() or public.is_squad_member(squad_id));
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
        and not public.is_blocked(c.sender_id, c.receiver_id)))
    or (conversation_type = 'squad' and public.is_squad_member(squad_id))
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
  using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

drop policy if exists perk_rules_staff on public.perk_rules;
create policy perk_rules_staff on public.perk_rules for all to authenticated
  using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
-- Los asistentes ven las reglas activas de su evento (progreso "Squad de 4 → trago").
drop policy if exists perk_rules_attendees on public.perk_rules;
create policy perk_rules_attendees on public.perk_rules for select to authenticated
  using (is_active and public.is_event_attendee(event_id));

drop policy if exists raffles_select on public.raffles;
create policy raffles_select on public.raffles for select to authenticated
  using (public.is_event_attendee(event_id) or public.is_event_staff(event_id));
drop policy if exists raffles_staff on public.raffles;
create policy raffles_staff on public.raffles for insert to authenticated with check (public.is_event_staff(event_id));

drop policy if exists songs_select on public.song_requests;
create policy songs_select on public.song_requests for select to authenticated
  using (public.is_event_attendee(event_id) or public.is_event_staff(event_id));

drop policy if exists menu_select on public.bar_menu_items;
create policy menu_select on public.bar_menu_items for select to authenticated using (true);
drop policy if exists menu_staff on public.bar_menu_items;
create policy menu_staff on public.bar_menu_items for all to authenticated
  using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

drop policy if exists orders_select on public.bar_orders;
create policy orders_select on public.bar_orders for select to authenticated
  using (user_id = auth.uid() or auth.uid() = any(split_user_ids) or public.is_event_staff(event_id));
drop policy if exists orders_staff_update on public.bar_orders;
create policy orders_staff_update on public.bar_orders for update to authenticated
  using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

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
) language sql stable security definer set search_path = public as $$
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
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_code public.event_invite_codes;
  v_squad public.squads;
  v_via join_via_t;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event from public.events where upper(master_invite_code) = upper(p_code) or slug = lower(p_code);
  if found then v_via := 'master_link';
  else
    select * into v_code from public.event_invite_codes where upper(code) = upper(p_code) for update;
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

  if exists (select 1 from public.event_attendees where event_id = v_event.id and user_id = v_uid) then
    update public.event_attendees set mood_tag = p_mood, last_active_at = now() where event_id = v_event.id and user_id = v_uid;
  else
    if v_via = 'single_use_code' then
      if v_code.is_used and v_code.used_by_user_id is distinct from v_uid then raise exception 'code_already_used'; end if;
      update public.event_invite_codes set is_used = true, used_by_user_id = v_uid, used_at = now() where id = v_code.id;
    elsif (select count(*) from public.event_attendees where event_id = v_event.id) >= v_event.max_capacity then
      raise exception 'event_full';
    end if;
    insert into public.event_attendees (event_id, user_id, mood_tag, joined_via) values (v_event.id, v_uid, p_mood, v_via);
  end if;

  if v_via = 'squad_link' and public.user_squad(v_event.id, v_uid) is null
     and not exists (select 1 from public.squad_members m where m.squad_id = v_squad.id and public.is_blocked(m.user_id, v_uid)) then
    insert into public.squad_members (squad_id, user_id, status, joined_at) values (v_squad.id, v_uid, 'joined', now())
    on conflict (squad_id, user_id) do update set status = 'joined', joined_at = now();
  end if;

  return v_event.id;
end $$;

-- Conectar: crea solicitud o, si había una recíproca pendiente, la convierte en match.
create or replace function public.send_connection(p_event uuid, p_receiver uuid)
returns public.connections language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_reciprocal public.connections;
  v_row public.connections;
begin
  if not public.lobby_is_open(p_event) then raise exception 'lobby_closed'; end if;
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
returns public.connections language plpgsql security definer set search_path = public as $$
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
returns trigger language plpgsql security definer set search_path = public as $$
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
returns public.squads language plpgsql security definer set search_path = public as $$
declare v_row public.squads;
begin
  if not public.lobby_is_open(p_event) or not public.is_event_attendee(p_event) then raise exception 'not_allowed'; end if;
  if public.user_squad(p_event, auth.uid()) is not null then raise exception 'already_in_squad'; end if;
  insert into public.squads (event_id, name, created_by) values (p_event, coalesce(nullif(trim(p_name), ''), 'Mi Squad'), auth.uid()) returning * into v_row;
  insert into public.squad_members (squad_id, user_id, status, joined_at) values (v_row.id, auth.uid(), 'joined', now());
  return v_row;
end $$;

create or replace function public.invite_to_squad(p_squad uuid, p_invitee uuid)
returns void language plpgsql security definer set search_path = public as $$
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
returns void language plpgsql security definer set search_path = public as $$
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
returns int language plpgsql security definer set search_path = public as $$
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
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'joined' then perform public.apply_squad_perk_rules(new.squad_id); end if;
  return new;
end $$;
-- Una regla nueva o reactivada aplica retroactivamente a los squads que ya cumplen (idéntico al motor).
create or replace function public.tg_perk_rule_apply()
returns trigger language plpgsql security definer set search_path = public as $$
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
returns public.map_pins language plpgsql security definer set search_path = public as $$
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
returns public.map_pins language plpgsql security definer set search_path = public as $$
declare v_matches uuid[]; v_pin public.map_pins;
begin
  if not public.lobby_is_open(p_event) or not public.is_event_attendee(p_event) then raise exception 'not_allowed'; end if;
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
returns void language plpgsql security definer set search_path = public as $$
declare v_event uuid; v_label text := coalesce(nullif(trim(p_label), ''), 'Nuestro Punto de Encuentro');
begin
  if not public.is_squad_member(p_squad) then raise exception 'not_member'; end if;
  update public.squads set base_pin_x = p_x, base_pin_y = p_y, base_pin_label = v_label where id = p_squad returning event_id into v_event;
  insert into public.messages (event_id, conversation_type, squad_id, sender_id, message_type, content)
  values (v_event, 'squad', p_squad, auth.uid(), 'system_alert', '🚩 Nuevo Punto Base: ' || v_label);
end $$;

create or replace function public.announce_base_meetup(p_squad uuid, p_minutes int default 10)
returns void language plpgsql security definer set search_path = public as $$
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
returns void language plpgsql security definer set search_path = public as $$
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
returns int language plpgsql security definer set search_path = public as $$
declare v_blast uuid; v_n int;
begin
  if not public.is_event_staff(p_event) then raise exception 'forbidden'; end if;
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
returns uuid language plpgsql security definer set search_path = public as $$
declare v_r public.raffles; v_winner uuid; v_perk uuid;
begin
  select * into v_r from public.raffles where id = p_raffle for update;
  if not public.is_event_staff(v_r.event_id) then raise exception 'forbidden'; end if;
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
returns public.user_perks_qrs language plpgsql security definer set search_path = public as $$
declare v_p public.user_perks_qrs;
begin
  select * into v_p from public.user_perks_qrs where qr_code_string = p_qr for update;
  if not found then raise exception 'invalid_qr'; end if;
  if not public.is_event_staff(v_p.event_id) then raise exception 'forbidden'; end if;
  if v_p.status = 'redeemed' then raise exception 'already_redeemed'; end if;
  update public.user_perks_qrs set status = 'redeemed', redeemed_at = now() where id = v_p.id returning * into v_p;
  return v_p;
end $$;

-- Barra Express: precios desde el servidor, vaquita reparte total_spent.
-- p_items: [{"item_id":"gin","qty":2}, ...]
create or replace function public.create_bar_order(p_event uuid, p_items jsonb, p_delivery delivery_type_t)
returns public.bar_orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb; v_total numeric(12,2); v_squad uuid; v_split uuid[] := '{}';
  v_pin public.map_pins; v_order public.bar_orders; v_share numeric(12,2);
begin
  if p_delivery = 'icebreaker_gift' then raise exception 'use_send_icebreaker'; end if;
  if not public.lobby_is_open(p_event) or not public.is_event_attendee(p_event, v_uid) then raise exception 'not_allowed'; end if;

  select jsonb_agg(jsonb_build_object('item_id', m.id, 'name', m.emoji || ' ' || m.name, 'qty', least(greatest((i->>'qty')::int, 1), 20), 'unit_price', m.price)),
         sum(m.price * least(greatest((i->>'qty')::int, 1), 20))
    into v_items, v_total
  from jsonb_array_elements(p_items) i
  join public.bar_menu_items m on m.event_id = p_event and m.id = i->>'item_id' and m.is_available;
  if v_items is null then raise exception 'empty_order'; end if;

  v_squad := public.user_squad(p_event, v_uid);
  if p_delivery = 'pin_delivery' then
    select * into v_pin from public.map_pins where event_id = p_event and user_id = v_uid and expires_at > now() order by created_at desc limit 1;
    if v_pin.id is null then raise exception 'pin_required'; end if;
  elsif p_delivery = 'squad_split' then
    if v_squad is null then raise exception 'squad_required'; end if;
    select array_agg(user_id) into v_split from public.squad_members where squad_id = v_squad and status = 'joined';
  end if;

  insert into public.bar_orders (event_id, user_id, squad_id, delivery_type, items_json, total_amount, split_user_ids, pickup_code,
                                 pin_coord_x, pin_coord_y, sector_name)
  values (p_event, v_uid, v_squad, p_delivery, v_items, v_total, v_split,
          case when p_delivery in ('fast_pickup','squad_split') then upper(encode(gen_random_bytes(2), 'hex')) end,
          v_pin.coord_x, v_pin.coord_y, v_pin.sector_name)
  returning * into v_order;

  if p_delivery = 'squad_split' then
    v_share := round(v_total / cardinality(v_split), 2);
    update public.event_attendees set total_spent = total_spent + v_share where event_id = p_event and user_id = any(v_split);
  else
    update public.event_attendees set total_spent = total_spent + v_total where event_id = p_event and user_id = v_uid;
  end if;
  return v_order;
end $$;

-- Sectores visitados (alimenta el filtro post-fiesta "Coincidieron en tu zona")
create or replace function public.tg_pin_mark_visited()
returns trigger language plpgsql security definer set search_path = public as $$
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
returns public.bar_orders language plpgsql security definer set search_path = public as $$
declare v_o public.bar_orders; v_flow bar_order_status_t[]; v_i int;
begin
  select * into v_o from public.bar_orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if not public.is_event_staff(v_o.event_id) then raise exception 'forbidden'; end if;
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
returns public.bar_orders language plpgsql security definer set search_path = public as $$
declare v_o public.bar_orders; v_code text := upper(regexp_replace(trim(p_code), '^ROUGE:ORDER:[^:]+:', '', 'i'));
begin
  if not public.is_event_staff(p_event) then raise exception 'forbidden'; end if;
  select * into v_o from public.bar_orders where event_id = p_event and upper(pickup_code) = v_code for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status = 'completed' then raise exception 'already_delivered'; end if;
  if v_o.status <> 'ready_qr' then raise exception 'not_ready'; end if;
  update public.bar_orders set status = 'completed' where id = v_o.id returning * into v_o;
  return v_o;
end $$;

-- Votar / pedir tema
create or replace function public.vote_song(p_event uuid, p_title text, p_artist text default '')
returns public.song_requests language plpgsql security definer set search_path = public as $$
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
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event) then raise exception 'forbidden'; end if;
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

-- Generador de códigos únicos de 1 uso (lote)
create or replace function public.generate_invite_codes(p_event uuid, p_count int)
returns setof public.event_invite_codes language plpgsql security definer set search_path = public as $$
begin
  if not public.is_event_staff(p_event) then raise exception 'forbidden'; end if;
  if p_count < 1 or p_count > 1000 then raise exception 'invalid_count'; end if;
  return query
  with ins as (
    insert into public.event_invite_codes (event_id, code)
    select p_event, upper(encode(gen_random_bytes(4), 'hex')) from generate_series(1, p_count)
    on conflict (code) do nothing
    returning *
  ) select * from ins;
end $$;

-- Limpieza de pines vencidos (programar con pg_cron cada 5 min:
--   select cron.schedule('purge-pins', '*/5 * * * *', $$select public.purge_expired_pins()$$); )
create or replace function public.purge_expired_pins()
returns int language sql security definer set search_path = public as $$
  with d as (delete from public.map_pins where expires_at <= now() returning 1) select count(*)::int from d;
$$;

-- Permisos de ejecución
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.purge_expired_pins() from authenticated;
revoke execute on function public.apply_squad_perk_rules(uuid) from authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- REALTIME (chat, pines, alertas, blasts, comandas)
-- ════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['messages','map_pins','connections','squad_members','squads','blast_deliveries',
                           'user_perks_qrs','bar_orders','song_requests','raffles','event_attendees'] loop
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
  with check (bucket_id = 'venue-maps' and public.is_event_staff(((storage.foldername(name))[1])::uuid));
