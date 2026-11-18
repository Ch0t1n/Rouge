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
-- [v1.7] Verticales: noche (ROUGE) y corporativo (ROUGE Pro). Espejo: EVENT_KINDS en types.ts.
do $$ begin
  create type event_kind_t as enum ('nightlife','corporate');
exception when duplicate_object then null; end $$;
-- [v1.10] Categoría de la entrada (zonas de control). Espejo: ATTENDEE_TIERS en types.ts.
do $$ begin
  create type attendee_tier_t as enum ('attendee','speaker','vip','press','sponsor');
exception when duplicate_object then null; end $$;
-- [v1.6] RRPP. En el resto del script NO se usa 'promoter'::staff_role_t (Postgres no deja usar un valor nuevo de un
-- enum en la misma transacción en que se agrega): se compara como texto (role::text = 'promoter').
alter type staff_role_t add value if not exists 'promoter';
-- [v1.7] Moods de eventos corporativos (prefijo pro_). Igual que 'promoter': en el script se comparan como texto
-- (mood_kind() usa mood::text), nunca como literal del enum.
alter type mood_tag_t add value if not exists 'pro_networking';
alter type mood_tag_t add value if not exists 'pro_selling';
alter type mood_tag_t add value if not exists 'pro_buying';
alter type mood_tag_t add value if not exists 'pro_partners';
alter type mood_tag_t add value if not exists 'pro_funding';
alter type mood_tag_t add value if not exists 'pro_hiring';
alter type mood_tag_t add value if not exists 'pro_learning';
alter type mood_tag_t add value if not exists 'pro_coffee';

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
-- [v1.7] Vertical del evento: define moods, perfil requerido, vocabulario y funciones (ver engine/verticals.ts).
alter table public.events add column if not exists kind event_kind_t not null default 'nightlife';

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

-- [v1.7] Perfiles adicionales: una cuenta, varias caras. Al entrar a un evento se elige con cuál mostrarse
-- (event_attendees.persona_id). El perfil de `profiles` es el Perfil principal (noche); en corporativo hace falta
-- un perfil 'corporate'. Espejo: ProfilePersona en types.ts y upsertPersona en el motor.
create table if not exists public.profile_personas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  kind               event_kind_t not null,
  label              text not null default '' check (char_length(label) <= 30),
  display_name       text not null check (char_length(display_name) between 1 and 60),
  bio                text not null default '' check (char_length(bio) <= 160),
  photos             jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4),
  music_genres       text[] not null default '{}' check (cardinality(music_genres) <= 5 and music_genres <@ array['Techno','House','Reggaetón','Cachengue','Pop','RKT','Indie','Urbano','Electrónica']),
  spotify_embed_url  text check (spotify_embed_url is null or spotify_embed_url ~ '^https://open\.spotify\.com/'),
  job_title          text not null default '' check (char_length(job_title) <= 60),
  company            text not null default '' check (char_length(company) <= 60),
  industry           text check (industry is null or industry in ('retail','manufacturing','services','tech','food','agro','construction','health','education','tourism','fashion','logistics','finance','other')),
  looking_for        text[] not null default '{}' check (cardinality(looking_for) <= 3 and looking_for <@ array['clients','suppliers','partners','investment','financing','talent','mentoring','software','marketing','logistics','export','advisory']),
  offering           text[] not null default '{}' check (cardinality(offering) <= 3 and offering <@ array['suppliers','partners','investment','financing','talent','mentoring','software','marketing','logistics','export','advisory']),
  linkedin_url       text check (linkedin_url is null or linkedin_url ~ '^https://www\.linkedin\.com/(in|company)/[A-Za-z0-9_%.-]{2,100}$'),
  created_at         timestamptz not null default now(),
  -- Profesional: cargo o empresa y al menos algo que busca u ofrece (así se calcula la afinidad de negocio).
  constraint personas_pro_chk check (kind::text <> 'corporate' or ((job_title <> '' or company <> '') and cardinality(looking_for) + cardinality(offering) > 0))
);
alter table public.event_attendees add column if not exists persona_id uuid references public.profile_personas(id) on delete set null;

-- [v1.10] Ficha ejecutiva (ROUGE Pro): bio profesional de 240, sitio web, detalle de qué busca/ofrece, contacto opcional
-- (NO es el teléfono de la cuenta) y quién lo ve (privacy_level, ⇔ personaContactVisible). Espejo: upsertPersona.
alter table public.profile_personas drop constraint if exists profile_personas_bio_check;
do $$ begin
  alter table public.profile_personas add constraint personas_bio_len_chk check (char_length(bio) <= case when kind::text = 'corporate' then 240 else 160 end);
exception when duplicate_object then null; end $$;
alter table public.profile_personas add column if not exists website_url text check (website_url is null or (char_length(website_url) <= 200 and website_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(/[^[:space:]]*)?$'));
alter table public.profile_personas add column if not exists looking_for_note text not null default '' check (char_length(looking_for_note) <= 120);
alter table public.profile_personas add column if not exists offering_note text not null default '' check (char_length(offering_note) <= 120);
alter table public.profile_personas add column if not exists contact_email text check (contact_email is null or (char_length(contact_email) <= 120 and contact_email ~ '^[^[:space:]@A-Z]+@[^[:space:]@A-Z]+\.[^[:space:]@A-Z]{2,}$'));
alter table public.profile_personas add column if not exists contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
alter table public.profile_personas add column if not exists privacy_level text not null default 'strict' check (privacy_level in ('strict','network','public'));

-- [v1.10] Categoría de cada asistente (la asigna el organizador o la trae su código de 1 uso) y de cada código.
alter table public.event_attendees add column if not exists tier attendee_tier_t not null default 'attendee';
alter table public.event_invite_codes add column if not exists tier attendee_tier_t;

-- [v1.10] Zonas de control: puertas (entrance: marcan la acreditación) y áreas internas (area: validan la categoría).
-- allowed_tiers vacío = cualquier categoría. Espejo: EventZone y engine/door.ts.
create table if not exists public.event_zones (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 40),
  kind           text not null default 'area' check (kind in ('entrance','area')),
  allowed_tiers  attendee_tier_t[] not null default '{}',
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create unique index if not exists event_zones_name_uq on public.event_zones (event_id, lower(name));

-- [v1.10] Registro de cada lectura del escáner (zone_id null = puerta principal sin zonas cargadas). Solo por RPC.
create table if not exists public.zone_check_ins (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  zone_id     uuid references public.event_zones(id) on delete set null,
  user_id     uuid references public.profiles(id) on delete set null,
  code_id     uuid references public.event_invite_codes(id) on delete set null,
  staff_id    uuid references public.profiles(id) on delete set null,
  status      text not null check (status in ('granted','denied')),
  reason      text not null,
  tier        attendee_tier_t,
  created_at  timestamptz not null default now()
);
create index if not exists idx_zone_checkins_event on public.zone_check_ins (event_id, created_at desc);

-- [v1.8] Privacidad: los demás solo saben SI alguien está acreditado (no a qué hora entró).
alter table public.event_attendees add column if not exists is_checked_in boolean generated always as (checked_in_at is not null) stored;
-- [v1.8] El organizador puede limitar el networking a quienes ya pasaron por la puerta (acreditados).
alter table public.events add column if not exists networking_checkin_only boolean not null default false;


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

-- [v1.8] Ajustes de privacidad de la cuenta (espejo: PrivacySettings en types.ts). Sin fila = valores por defecto.
create table if not exists public.privacy_settings (
  user_id                    uuid primary key references public.profiles(id) on delete cascade,
  incognito_default          boolean not null default false,  -- entra a cada evento en Modo Solo Amigos / Contactos
  pin_share_matches          boolean not null default true,   -- false: el pin solo se comparte con el Squad
  pro_details_after_meeting  boolean not null default false,  -- empresa y cargo ocultos hasta una reunión o contacto aceptado
  updated_at                 timestamptz not null default now()
);

-- [v1.8] Salas, mesas y puntos de encuentro que carga el organizador (espejo: VenueSpot).
create table if not exists public.venue_spots (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 40),
  kind        text not null default 'room' check (kind in ('room','table','point')),
  capacity    integer check (capacity is null or capacity between 1 and 50),  -- reuniones a la vez (null = sin límite)
  coord_x     double precision check (coord_x is null or coord_x between 0 and 100),
  coord_y     double precision check (coord_y is null or coord_y between 0 and 100),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (event_id, name)
);

-- [v1.8] Leads de la página /empresas. SOLO servidor (RLS sin políticas): los escribe /api/leads con service role.
create table if not exists public.b2b_leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 80),
  company      text not null check (char_length(company) between 2 and 120),
  email        text not null check (char_length(email) <= 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp     text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  event_type   text not null,
  attendees    integer not null check (attendees between 10 and 100000),
  message      text not null default '' check (char_length(message) <= 1000),
  source       text not null default 'pro' check (char_length(source) <= 60),
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- [v1.9] Cargo de quien pide la demo en /pro (opcional).
alter table public.b2b_leads add column if not exists job_title text check (job_title is null or char_length(job_title) <= 80);
-- Tipos de evento (⇔ LEAD_EVENT_TYPES en lib/leads.ts). Se recrea para sumar valores sin perder filas.
alter table public.b2b_leads drop constraint if exists b2b_leads_event_type_check;
alter table public.b2b_leads add constraint b2b_leads_event_type_check
  check (event_type in ('congress','expo','internal','cowork','launch','other'));

-- [v1.8] Reuniones 1 a 1 dentro de un evento (espejo: Meeting). "Completada" se deriva (aceptada y ya terminó).
create table if not exists public.meetings (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  requester_id   uuid not null references public.profiles(id) on delete cascade,
  invitee_id     uuid not null references public.profiles(id) on delete cascade,
  topic          text not null check (char_length(topic) between 1 and 140),
  starts_at      timestamptz not null,
  duration_min   integer not null check (duration_min in (15, 30)),
  location_kind  text not null default 'tbd' check (location_kind in ('spot','pin','tbd')),
  spot_id        uuid references public.venue_spots(id) on delete restrict,
  pin_x          double precision check (pin_x is null or pin_x between 0 and 100),
  pin_y          double precision check (pin_y is null or pin_y between 0 and 100),
  pin_label      text check (pin_label is null or char_length(pin_label) <= 60),
  status         text not null default 'pending' check (status in ('pending','accepted','rescheduled','declined','cancelled')),
  proposed_by    uuid not null references public.profiles(id) on delete cascade,
  connection_id  uuid references public.connections(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint meetings_not_self check (requester_id <> invitee_id),
  constraint meetings_location_chk check (
    (location_kind = 'spot' and spot_id is not null) or
    (location_kind = 'pin' and pin_x is not null and pin_y is not null) or
    location_kind = 'tbd')
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
create index if not exists idx_personas_user          on public.profile_personas (user_id);
create index if not exists idx_attendees_persona      on public.event_attendees (persona_id) where persona_id is not null;
create index if not exists idx_spots_event            on public.venue_spots (event_id);
create index if not exists idx_meetings_event         on public.meetings (event_id, starts_at);
create index if not exists idx_meetings_people        on public.meetings (requester_id, invitee_id);
create index if not exists idx_meetings_spot          on public.meetings (spot_id, starts_at) where spot_id is not null;

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

create or replace function public.is_event_staff(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  -- [v1.6] El RRPP NO es staff para ver datos (pines, squads, pedidos, perks): solo tiene su link y sus números.
  select exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user and role::text <> 'promoter')
      or exists (select 1 from public.events where id = p_event and created_by = p_user);
$$;

-- Permisos por rol (espejo de src/lib/engine/roles.ts). Quien creó el evento es 'owner' aunque no tenga fila.
create or replace function public.has_staff_role(p_event uuid, p_roles staff_role_t[], p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.event_staff where event_id = p_event and user_id = p_user and role = any(p_roles))
      or ('owner' = any(p_roles) and exists (select 1 from public.events where id = p_event and created_by = p_user));
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

-- [v1.8] ¿Puede `p_viewer` ver la asistencia de `p_target` a un evento? (⇔ canSeeAttendee en selectors.ts)
-- Uno mismo y el equipo (sin RRPP) siempre. Otro asistente: sin bloqueo, y si está en Modo Solo Amigos solo su Squad y
-- sus matches; si el evento limita el networking a acreditados, los dos tienen que haber pasado por la puerta.
create or replace function public.can_see_attendee(p_event uuid, p_viewer uuid, p_target uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select p_viewer = p_target
    or public.is_event_staff(p_event, p_viewer)
    or exists (
      select 1 from public.event_attendees t join public.events e on e.id = t.event_id
      where t.event_id = p_event and t.user_id = p_target
        and public.is_event_attendee(p_event, p_viewer)
        and not public.is_blocked(p_viewer, p_target)
        and (
          public.are_squadmates(p_event, p_viewer, p_target) or public.is_match(p_event, p_viewer, p_target)
          or (not t.ghost_mode and (not e.networking_checkin_only or (
                t.checked_in_at is not null and exists (
                  select 1 from public.event_attendees v where v.event_id = p_event and v.user_id = p_viewer and v.checked_in_at is not null))))
        )
    );
$$;

-- [v1.8] ¿`p_user` puede hacer networking nuevo en el evento? (si el evento lo limita, solo acreditados)
create or replace function public.networking_open_for(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.event_attendees a join public.events e on e.id = a.event_id
    where a.event_id = p_event and a.user_id = p_user and (not e.networking_checkin_only or a.checked_in_at is not null));
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
alter table public.profile_personas    enable row level security;
alter table public.privacy_settings    enable row level security;
alter table public.venue_spots         enable row level security;
alter table public.event_zones         enable row level security;
alter table public.zone_check_ins      enable row level security;
alter table public.meetings            enable row level security;
alter table public.b2b_leads           enable row level security;

-- PROFILES ── [v1.8] cada uno lee SOLO su fila. Los demás perfiles se leen con profile_cards(): tarjeta saneada según
-- el contexto (edad y no fecha de nacimiento; @usuario y fotos solo si esa persona se mostró con su Perfil principal
-- en un evento que compartimos). El teléfono nunca es legible por otros (column privileges).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select (id, username, full_name, birth_date, gender, bio, photos, loop_video_url, music_genres, spotify_embed_url, instagram_username, instagram_verified, is_verified, created_at)
  on public.profiles to authenticated;
-- is_verified solo lo modifica el staff de ROUGE (service role); instagram_verified lo calcula el trigger
grant insert (id, username, full_name, birth_date, gender, phone_normalized, bio, photos, loop_video_url, music_genres, spotify_embed_url, instagram_username)
  on public.profiles to authenticated;
grant update (username, full_name, birth_date, gender, phone_normalized, bio, photos, loop_video_url, music_genres, spotify_embed_url, instagram_username)
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

-- [v1.7] PROFILE_PERSONAS ── veo los míos y los que alguien USA en un evento donde estoy (asistente o equipo),
-- sin bloqueo. Un perfil que no se usó en un evento compartido nunca es legible por otros. Altas y edición directas
-- (privilegios por columna: kind y user_id no se editan); la baja va por delete_persona (no se borra en uso).
-- [v1.8] Solo los propios por tabla; los de otros, saneados por persona_cards() (sin el nombre interno, LinkedIn solo tras
-- un contacto o reunión aceptada, empresa y cargo según los ajustes de privacidad de su dueño/a).
drop policy if exists personas_select on public.profile_personas;
create policy personas_select on public.profile_personas for select to authenticated using (user_id = auth.uid());
drop policy if exists personas_insert on public.profile_personas;
create policy personas_insert on public.profile_personas for insert to authenticated with check (user_id = auth.uid());
drop policy if exists personas_update on public.profile_personas;
create policy personas_update on public.profile_personas for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.profile_personas from anon, authenticated;
grant select on public.profile_personas to authenticated;
grant insert (id, user_id, kind, label, display_name, bio, photos, music_genres, spotify_embed_url, job_title, company, industry, looking_for, offering, linkedin_url,
               website_url, looking_for_note, offering_note, contact_email, contact_phone, privacy_level)
  on public.profile_personas to authenticated;
grant update (label, display_name, bio, photos, music_genres, spotify_embed_url, job_title, company, industry, looking_for, offering, linkedin_url,
              website_url, looking_for_note, offering_note, contact_email, contact_phone, privacy_level)
  on public.profile_personas to authenticated;

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
create policy events_update on public.events for update to authenticated using (public.is_event_manager(id)) with check (public.is_event_manager(id));
-- El código maestro no se expone a anónimos (la landing /join solo necesita datos públicos)
revoke all on public.events from anon;
grant select (id, kind, slug, name, description, venue_name, cover_url, starts_at, ends_at, lobby_opens_at, lobby_expires_at, max_capacity,
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
create policy attendees_select on public.event_attendees for select to authenticated using (public.can_see_attendee(event_id, auth.uid(), user_id));
drop policy if exists attendees_update_self on public.event_attendees;
create policy attendees_update_self on public.event_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.event_attendees from authenticated;
grant update (mood_tag, ghost_mode, only_liked_can_icebreak, last_active_at) on public.event_attendees to authenticated;
-- [v1.8] Columnas privadas: gasto, cómo entró, RRPP, hora de ingreso y sectores donde dejó pin NO se leen por tabla
-- (tampoco viajan por Realtime). Lo propio: my_attendances(); el equipo: event_attendance(); zonas en común: shared_zones().
revoke select on public.event_attendees from anon, authenticated;
grant select (id, event_id, user_id, mood_tag, persona_id, ghost_mode, only_liked_can_icebreak, icebreaker_used, last_active_at, joined_at, is_checked_in, tier)
  on public.event_attendees to authenticated;

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
-- [v1.8] El equipo ya no ve todos los pines: solo las alertas de rescate (seguridad). El resto, solo Squad y matches elegidos.
create policy pins_select on public.map_pins for select to authenticated
  using (public.can_see_pin(map_pins) or (is_rescue_alert and public.is_event_staff(event_id)));
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

-- [v1.7] Afinidad de negocio (⇔ businessAffinity en verticals.ts). Lo que cada lado gana del otro: lo que busca y el
-- otro ofrece, + 'clients' si el otro busca algo que ofrece, + 'partners' si ambos buscan socios. 1 cosa = 0,7; 2+ = 1;
-- promedio entre los lados que buscan algo (75 %) + rubro en común (25 %).
create or replace function public.business_affinity(a_look text[], a_off text[], a_ind text, b_look text[], b_off text[], b_ind text)
returns numeric language plpgsql immutable set search_path = public, extensions as $$
declare ga int; gb int; n int := 0; total numeric := 0;
begin
  ga := cardinality(array(
          select x from unnest(a_look) x where x = any(b_off)
          union select 'clients' where 'clients' = any(a_look) and b_look && a_off
          union select 'partners' where 'partners' = any(a_look) and 'partners' = any(b_look)));
  gb := cardinality(array(
          select x from unnest(b_look) x where x = any(a_off)
          union select 'clients' where 'clients' = any(b_look) and a_look && b_off
          union select 'partners' where 'partners' = any(b_look) and 'partners' = any(a_look)));
  if cardinality(a_look) > 0 then n := n + 1; total := total + case when ga = 0 then 0 when ga = 1 then 0.7 else 1 end; end if;
  if cardinality(b_look) > 0 then n := n + 1; total := total + case when gb = 0 then 0 when gb = 1 then 0.7 else 1 end; end if;
  return 0.75 * case when n = 0 then 0 else total / n end + 0.25 * case when a_ind is not null and a_ind = b_ind then 1 else 0 end;
end $$;

-- Grilla: asistentes visibles + afinidad + rank + zonas en común. [v1.7] Devuelve la CARA del evento (perfil elegido
-- al entrar): en corporativo nunca los datos del Perfil principal (sin perfil profesional → cara neutra, sin fotos).
-- Afinidad: noche = Dice sobre géneros; corporativo = "busco ↔ ofrezco" (75 %) + rubro en común (25 %). Espejo: affinity.ts.
drop function if exists public.event_grid(uuid);
create or replace function public.event_grid(p_event uuid)
returns table (
  user_id uuid, username citext, full_name text, birth_date date, gender gender_t, bio text, photos jsonb,
  loop_video_url text, music_genres text[], spotify_embed_url text, is_verified boolean,
  persona_id uuid, job_title text, company text, industry text, looking_for text[], offering text[],
  mood_tag mood_tag_t, last_active_at timestamptz, music_affinity int, rank numeric, shared_zones text[]
) language sql stable security definer set search_path = public, extensions as $$
  with ev as (select kind::text as kind from public.events where id = p_event),
  faces as (
    select a.user_id, a.mood_tag, a.last_active_at, a.visited_sectors, a.ghost_mode, p.username, p.birth_date, p.is_verified,
           pp.id as persona_id,
           coalesce(nullif(pp.display_name, ''), p.full_name) as full_name,
           case when pp.id is not null then pp.bio when ev.kind = 'corporate' then '' else p.bio end as bio,
           case when pp.id is not null then pp.photos when ev.kind = 'corporate' then '[]'::jsonb else p.photos end as photos,
           case when pp.id is null and ev.kind = 'nightlife' then p.loop_video_url end as loop_video_url,
           case when ev.kind = 'corporate' then '{}'::text[] when pp.id is not null then pp.music_genres else p.music_genres end as music_genres,
           case when ev.kind = 'corporate' then null when pp.id is not null then pp.spotify_embed_url else p.spotify_embed_url end as spotify_embed_url,
           case when ev.kind = 'corporate' then 'undisclosed'::gender_t else p.gender end as gender,
           coalesce(pp.job_title, '') as job_title, coalesce(pp.company, '') as company, pp.industry,
           coalesce(pp.looking_for, '{}') as looking_for, coalesce(pp.offering, '{}') as offering
    from public.event_attendees a
    join public.profiles p on p.id = a.user_id
    cross join ev
    left join public.profile_personas pp on pp.id = a.persona_id
    where a.event_id = p_event
  ),
  me as (select * from faces where faces.user_id = auth.uid()),
  scored as (
    select f.*, me.mood_tag as my_mood, me.visited_sectors as my_zones,
      case when ev.kind = 'corporate' then
        public.business_affinity(me.looking_for, me.offering, me.industry, f.looking_for, f.offering, f.industry)
      else
        coalesce(2.0 * cardinality(array(select unnest(f.music_genres) intersect select unnest(me.music_genres)))
          / nullif(cardinality(f.music_genres) + cardinality(me.music_genres), 0), 0)
      end as main
    from faces f cross join me cross join ev
  )
  select s.user_id, s.username, s.full_name, s.birth_date, s.gender, s.bio, s.photos, s.loop_video_url, s.music_genres,
         s.spotify_embed_url, s.is_verified, s.persona_id, s.job_title, s.company, s.industry, s.looking_for, s.offering,
         s.mood_tag, s.last_active_at,
         round(100 * s.main)::int as music_affinity,
         round((
           0.60 * s.main
         + 0.25 * case when s.mood_tag = s.my_mood then 0.8
                       when s.mood_tag::text in ('open_to_meet','at_bar','after_hunt') and s.my_mood::text in ('open_to_meet','at_bar','after_hunt') then 0.7
                       when s.mood_tag::text in ('pro_selling','pro_buying') and s.my_mood::text in ('pro_selling','pro_buying') and s.mood_tag <> s.my_mood then 1
                       else 0.4 end
         + 0.15 * greatest(0, 1 - extract(epoch from now() - s.last_active_at) / 5400)
         )::numeric, 4) as rank,
         array(select unnest(s.visited_sectors) intersect select unnest(s.my_zones)) as shared_zones
  from scored s
  where s.user_id <> auth.uid() and not s.ghost_mode
    and not public.is_blocked(auth.uid(), s.user_id)
    and public.lobby_is_open(p_event)
    and not exists (select 1 from public.connections c where c.event_id = p_event and c.status = 'rejected'
                    and ((c.sender_id = auth.uid() and c.receiver_id = s.user_id) or (c.sender_id = s.user_id and c.receiver_id = auth.uid())))
  order by rank desc;
$$;

-- [v1.7] Vertical de un mood (⇔ moodKind en verticals.ts): los corporativos empiezan con 'pro_'.
create or replace function public.mood_kind(p_mood mood_tag_t)
returns event_kind_t language sql immutable set search_path = public, extensions as $$
  select (case when p_mood::text like 'pro\_%' then 'corporate' else 'nightlife' end)::event_kind_t;
$$;

-- Ingreso por Link Maestro, Código Único de 1 uso o link de Squad.
-- [v1.7] p_persona: perfil con el que se muestra (null = Perfil principal, solo en eventos de noche).
drop function if exists public.join_event(text, mood_tag_t);
create or replace function public.join_event(p_code text, p_mood mood_tag_t, p_persona uuid default null)
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
  -- [v1.7] Vertical: mood y perfil del tipo de evento (⇔ checkMoodForEvent / checkPersonaForEvent).
  if public.mood_kind(p_mood) <> v_event.kind then raise exception 'invalid_mood'; end if;
  if p_persona is null and v_event.kind::text = 'corporate' then raise exception 'persona_required'; end if;
  if p_persona is not null and not exists (select 1 from public.profile_personas where id = p_persona and user_id = v_uid and kind = v_event.kind) then
    raise exception 'invalid_persona';
  end if;

  if exists (select 1 from public.event_attendees where event_id = v_event.id and user_id = v_uid) then
    update public.event_attendees set mood_tag = p_mood, persona_id = p_persona, last_active_at = now() where event_id = v_event.id and user_id = v_uid;
  else
    if v_via = 'single_use_code' then
      if v_code.is_used and v_code.used_by_user_id is distinct from v_uid then raise exception 'code_already_used'; end if;
      update public.event_invite_codes set is_used = true, used_by_user_id = v_uid, used_at = now() where id = v_code.id;
    elsif (select count(*) from public.event_attendees where event_id = v_event.id) >= v_event.max_capacity then
      raise exception 'event_full';
    end if;
    -- [v1.8] Modo incógnito por defecto (ajustes de privacidad): entra sin aparecer en la grilla.
    -- [v1.10] La categoría (VIP, SPEAKER…) viene del código de 1 uso.
    insert into public.event_attendees (event_id, user_id, mood_tag, persona_id, joined_via, referred_by, ghost_mode, tier)
    values (v_event.id, v_uid, p_mood, p_persona, v_via,
            case when v_link.user_id is distinct from v_uid and v_event.kind::text = 'nightlife' then v_link.user_id end,
            coalesce((select incognito_default from public.privacy_settings where user_id = v_uid), false),
            coalesce(v_code.tier, 'attendee'));
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
      'id', v_event.id, 'kind', v_event.kind, 'slug', v_event.slug, 'name', v_event.name, 'description', v_event.description,
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
  if not public.is_event_attendee(p_event, v_uid) or not public.is_event_attendee(p_event, p_receiver) then raise exception 'not_attendee'; end if;
  if public.is_blocked(v_uid, p_receiver) then raise exception 'unavailable'; end if;
  if exists (select 1 from public.event_attendees where event_id = p_event and user_id = v_uid and ghost_mode) then raise exception 'sender_in_ghost_mode'; end if;
  if public.is_match(p_event, v_uid, p_receiver) then raise exception 'already_matched'; end if;
  -- [v1.8] Solo a quien puedo ver (Modo Solo Amigos, bloqueos, networking solo para acreditados).
  if not public.networking_open_for(p_event, v_uid) then raise exception 'checkin_required'; end if;
  if not public.can_see_attendee(p_event, v_uid, p_receiver) then raise exception 'unavailable'; end if;

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
  select * into v_att from public.event_attendees where event_id = p_event and user_id = v_uid for update;
  select * into v_rcv from public.event_attendees where event_id = p_event and user_id = p_receiver;
  if v_att.id is null or v_rcv.id is null or public.is_blocked(v_uid, p_receiver) or v_rcv.ghost_mode then raise exception 'unavailable'; end if;
  if not public.networking_open_for(p_event, v_uid) then raise exception 'checkin_required'; end if;
  if not public.can_see_attendee(p_event, v_uid, p_receiver) then raise exception 'unavailable'; end if;
  if v_att.ghost_mode then raise exception 'sender_in_ghost_mode'; end if;
  if v_att.icebreaker_used then raise exception 'icebreaker_already_used'; end if;
  if coalesce(trim(p_message), '') = '' or char_length(p_message) > 140 then raise exception 'invalid_message'; end if;
  if public.is_match(p_event, v_uid, p_receiver) then raise exception 'already_matched'; end if;
  if v_rcv.only_liked_can_icebreak and not exists (
    select 1 from public.connections where event_id = p_event and sender_id = p_receiver and receiver_id = v_uid
  ) then raise exception 'receiver_only_accepts_liked'; end if;

  if p_gift_item is not null then
    -- [v1.7] Sin trago de regalo en eventos corporativos.
    if (select kind::text from public.events where id = p_event) <> 'nightlife' then raise exception 'not_in_vertical'; end if;
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
  -- [v1.8] Si la persona eligió compartir su ubicación solo con su Squad, no se acepta ningún match.
  if cardinality(coalesce(p_match_ids, '{}')) > 0
     and not coalesce((select pin_share_matches from public.privacy_settings where user_id = auth.uid()), true) then
    raise exception 'pin_squad_only';
  end if;
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
  -- [v1.7] El filtro por género no existe en eventos corporativos.
  if v_r.filter = 'female' and (select kind::text from public.events where id = v_r.event_id) <> 'nightlife' then raise exception 'not_in_vertical'; end if;

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
  -- [v1.7] Pedir temas al DJ es solo de la noche.
  if (select kind::text from public.events where id = p_event) <> 'nightlife' then raise exception 'not_in_vertical'; end if;
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
    -- [v1.8] Pines activos y reuniones: solo conteos (el equipo no ve dónde está cada uno ni quién se reúne con quién).
    'active_pins',        (select count(*) from public.map_pins mp where mp.event_id = p_event and mp.expires_at > now()),
    'meetings_requested', (select count(*) from public.meetings mt where mt.event_id = p_event),
    'meetings_accepted',  (select count(*) from public.meetings mt where mt.event_id = p_event and mt.status = 'accepted'),
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

-- [v1.10] p_tier: categoría de las entradas del lote (null = asistente).
drop function if exists public.generate_invite_codes(uuid, int);
create or replace function public.generate_invite_codes(p_event uuid, p_count int, p_tier attendee_tier_t default null)
returns setof public.event_invite_codes language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  if p_count < 1 or p_count > 1000 then raise exception 'invalid_count'; end if;
  return query
  with ins as (
    insert into public.event_invite_codes (event_id, code, tier)
    select p_event, public.new_access_code(), p_tier from generate_series(1, p_count)
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

-- ════════════════════════════════════════════════════════════════════════
-- [v1.7] VERTICALES Y PERFILES ADICIONALES (espejo: engine/verticals.ts y upsertPersona / deletePersona)
-- ════════════════════════════════════════════════════════════════════════

-- El tipo de evento no cambia una vez que entró alguien (moods y perfiles ya elegidos para esa vertical).
create or replace function public.tg_events_kind_locked()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.kind is distinct from old.kind and exists (select 1 from public.event_attendees where event_id = old.id) then
    raise exception 'kind_locked';
  end if;
  return new;
end $$;
drop trigger if exists events_kind_locked on public.events;
create trigger events_kind_locked before update of kind on public.events for each row execute function public.tg_events_kind_locked();

-- Mood y perfil del asistente siempre de la vertical del evento (también si el cliente actualiza el mood directo).
-- Un perfil borrado deja persona_id en null (FK on delete set null): los demás ven una cara neutra, nunca otra.
create or replace function public.tg_attendee_vertical()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_kind event_kind_t; v_pkind event_kind_t; v_puser uuid;
begin
  select kind into v_kind from public.events where id = new.event_id;
  if new.mood_tag is not null and public.mood_kind(new.mood_tag) <> v_kind then raise exception 'invalid_mood'; end if;
  if new.persona_id is not null then
    select kind, user_id into v_pkind, v_puser from public.profile_personas where id = new.persona_id;
    if v_puser is distinct from new.user_id or v_pkind is distinct from v_kind then raise exception 'invalid_persona'; end if;
  elsif tg_op = 'INSERT' and v_kind::text = 'corporate' then
    raise exception 'persona_required';
  end if;
  return new;
end $$;
drop trigger if exists attendee_vertical on public.event_attendees;
create trigger attendee_vertical before insert or update of mood_tag, persona_id on public.event_attendees
  for each row execute function public.tg_attendee_vertical();

-- Hasta 5 perfiles además del principal (⇔ MAX_PERSONAS).
create or replace function public.tg_personas_limit()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if (select count(*) from public.profile_personas where user_id = new.user_id) >= 5 then raise exception 'too_many_personas'; end if;
  return new;
end $$;
drop trigger if exists personas_limit on public.profile_personas;
create trigger personas_limit before insert on public.profile_personas for each row execute function public.tg_personas_limit();

-- Borrar un perfil: no mientras se usa en un evento con el lobby abierto (⇔ deletePersona).
create or replace function public.delete_persona(p_persona uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.profile_personas where id = p_persona and user_id = auth.uid()) then raise exception 'not_found'; end if;
  if exists (select 1 from public.event_attendees a join public.events e on e.id = a.event_id
             where a.persona_id = p_persona and now() < e.lobby_expires_at) then
    raise exception 'persona_in_use';
  end if;
  delete from public.profile_personas where id = p_persona;
end $$;

-- [v1.6] RRPP: link propio (lo pide el RRPP o dueño/a/producción para un RRPP del equipo). Código generado acá.
create or replace function public.ensure_promoter_link(p_event uuid, p_user uuid default auth.uid())
returns public.promoter_links language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.promoter_links; v_code text;
begin
  -- [v1.7] RRPP es solo de la noche.
  if (select kind::text from public.events where id = p_event) <> 'nightlife' then raise exception 'not_in_vertical'; end if;
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
create or replace function public.promoter_stats(p_event uuid)
returns table (user_id uuid, link_id uuid, code text, commission_per_entry numeric, entries int, checked_in int, billable int, to_pay numeric)
language sql stable security definer set search_path = public, extensions as $$
  with door as (
    select exists (select 1 from public.event_attendees where event_id = p_event and checked_in_at is not null)
        or exists (select 1 from public.event_invite_codes where event_id = p_event and checked_in_at is not null) as uses_door
  ), base as (
    select s.user_id, l.id as link_id, l.code, coalesce(l.commission_per_entry, 0) as commission_per_entry,
           (select count(*)::int from public.event_attendees a where a.event_id = p_event and a.referred_by = s.user_id) as entries,
           (select count(*)::int from public.event_attendees a where a.event_id = p_event and a.referred_by = s.user_id and a.checked_in_at is not null) as checked_in
    from public.event_staff s
    left join public.promoter_links l on l.event_id = s.event_id and l.user_id = s.user_id
    where s.event_id = p_event and s.role::text = 'promoter'
      and (public.is_event_manager(p_event) or s.user_id = auth.uid())
  )
  select b.user_id, b.link_id, b.code, b.commission_per_entry, b.entries, b.checked_in,
         case when d.uses_door then b.checked_in else b.entries end as billable,
         round((case when d.uses_door then b.checked_in else b.entries end) * b.commission_per_entry, 2) as to_pay
  from base b cross join door d
  order by b.entries desc;
$$;

-- [v1.10] Escáner por zona (espejo de zoneCheckIn en door.ts). p_zone null = puerta principal (sin zonas cargadas).
-- Entrada (código de 1 uso o su URL /join/<código>) o pase de la app (ROUGE:PASS:<evento>:<usuario>).
--   entrance: valida y marca la acreditación · area: valida que la categoría (tier) esté habilitada en la zona.
-- Devuelve la cara del evento: en la noche nombre, foto y edad (+18); en corporativo el perfil profesional (nunca la
-- cara de la noche), cargo, empresa y categoría. Registra TODA lectura en zone_check_ins. Dueño/a, producción y seguridad.
create or replace function public.zone_check_in(p_event uuid, p_zone uuid, p_value text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_raw text := trim(coalesce(p_value, '')); v_code text; v_ev public.events; v_c public.event_invite_codes;
  v_att public.event_attendees; v_user uuid; v_p public.profiles; v_pp public.profile_personas; v_parts text[];
  v_status text; v_kind text; v_at timestamptz; v_zone public.event_zones; v_zkind text := 'entrance';
  v_zname text := 'Puerta principal'; v_allowed attendee_tier_t[] := '{}'; v_tier attendee_tier_t; v_label text;
  v_name text; v_photo text; v_age int; v_username text;
begin
  if not public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]) then raise exception 'forbidden'; end if;
  select * into v_ev from public.events where id = p_event;
  if p_zone is not null then
    select * into v_zone from public.event_zones where id = p_zone and event_id = p_event and is_active;
    if v_zone.id is null then raise exception 'zone_not_found'; end if;
    v_zkind := v_zone.kind; v_zname := v_zone.name; v_allowed := v_zone.allowed_tiers;
  end if;

  if upper(v_raw) like 'ROUGE:PASS:%' then
    v_kind := 'pass';
    v_parts := string_to_array(substr(v_raw, 12), ':');
    if coalesce(array_length(v_parts, 1), 0) < 2 then v_status := 'invalid';
    elsif v_parts[1] <> p_event::text then v_status := 'other_event';
    else
      begin v_user := v_parts[2]::uuid; exception when others then v_status := 'invalid'; end;
      if v_status is null then
        select * into v_att from public.event_attendees where event_id = p_event and user_id = v_user for update;
        if exists (select 1 from public.event_bans where event_id = p_event and user_id = v_user) then v_status := 'banned';
        elsif v_att.id is null then v_status := 'not_attendee';
        else
          v_tier := v_att.tier;
          if cardinality(v_allowed) > 0 and not (v_tier = any(v_allowed)) then v_status := 'zone_denied'; v_at := v_att.checked_in_at;
          elsif v_zkind = 'area' then v_status := 'ok'; v_at := v_att.checked_in_at;
          elsif v_att.checked_in_at is not null then v_status := 'already'; v_at := v_att.checked_in_at;
          else
            update public.event_attendees set checked_in_at = now() where id = v_att.id returning checked_in_at into v_at;
            v_status := 'ok';
          end if;
        end if;
      end if;
    end if;
  elsif upper(v_raw) like 'BEGIN:VCARD%' then
    -- La tarjeta personal no es una entrada.
    v_kind := 'vcard'; v_status := 'invalid'; v_label := 'Es una tarjeta personal (vCard), no un pase';
  else
    v_kind := 'code';
    v_code := upper(coalesce(substring(v_raw from '/join/([^/?#[:space:]]+)'), v_raw));
    if upper(v_ev.slug) = v_code or upper(v_ev.master_invite_code) = v_code or exists (select 1 from public.promoter_links where upper(code) = v_code) then
      v_status := 'general_link';
    else
      select * into v_c from public.event_invite_codes where upper(code) = v_code for update;
      if v_c.id is null then v_status := 'invalid';
      elsif v_c.event_id <> p_event then v_status := 'other_event'; v_c := null;
      else
        v_user := v_c.used_by_user_id; v_label := v_c.label;
        if v_user is not null then select * into v_att from public.event_attendees where event_id = p_event and user_id = v_user; end if;
        v_tier := coalesce(v_att.tier, v_c.tier, 'attendee');
        if v_c.revoked_at is not null then v_status := 'revoked';
        elsif v_user is not null and exists (select 1 from public.event_bans where event_id = p_event and user_id = v_user) then v_status := 'banned';
        elsif cardinality(v_allowed) > 0 and not (v_tier = any(v_allowed)) then v_status := 'zone_denied'; v_at := v_c.checked_in_at;
        elsif v_zkind = 'area' then v_status := 'ok'; v_at := v_c.checked_in_at;
        elsif v_c.checked_in_at is not null then v_status := 'already'; v_at := v_c.checked_in_at;
        else
          update public.event_invite_codes set checked_in_at = now(), checked_in_by = auth.uid() where id = v_c.id returning checked_in_at into v_at;
          if v_user is not null then update public.event_attendees set checked_in_at = coalesce(checked_in_at, now()) where event_id = p_event and user_id = v_user; end if;
          v_status := 'ok';
        end if;
      end if;
    end if;
  end if;

  if v_user is not null then
    select * into v_p from public.profiles where id = v_user;
    if v_ev.kind::text = 'corporate' then
      select * into v_pp from public.profile_personas where id = v_att.persona_id;
      v_name := coalesce(nullif(v_pp.display_name, ''), v_p.full_name); v_photo := v_pp.photos->0->>'url';
    elsif v_p.id is not null then
      v_name := v_p.full_name; v_photo := v_p.photos->0->>'url'; v_username := v_p.username;
      v_age := date_part('year', age(v_p.birth_date))::int;
    end if;
  end if;

  insert into public.zone_check_ins (event_id, zone_id, user_id, code_id, staff_id, status, reason, tier)
  values (p_event, p_zone, v_p.id, v_c.id, auth.uid(), case when v_status = 'ok' then 'granted' else 'denied' end, v_status, v_tier);

  return jsonb_build_object(
    'status', v_status, 'kind', v_kind, 'user_id', v_p.id, 'name', v_name, 'username', v_username, 'photo', v_photo,
    'age', v_age, 'label', v_label, 'checked_in_at', v_at,
    'zone_id', p_zone, 'zone_name', v_zname, 'zone_kind', v_zkind, 'allowed_tiers', to_jsonb(v_allowed),
    'tier', v_tier, 'company', nullif(v_pp.company, ''), 'job_title', nullif(v_pp.job_title, ''));
end $$;

-- [v1.6] Puerta (espejo de doorCheckIn): la puerta principal del escáner por zona.
create or replace function public.door_check_in(p_event uuid, p_value text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select public.zone_check_in(p_event, null, p_value);
$$;

-- [v1.10] Categoría de un asistente (VIP, SPEAKER, PRENSA, SPONSOR). Dueño/a y producción (⇔ setAttendeeTier).
create or replace function public.set_attendee_tier(p_event uuid, p_user uuid, p_tier attendee_tier_t)
returns public.event_attendees language plpgsql security definer set search_path = public, extensions as $$
declare v_att public.event_attendees;
begin
  if not public.is_event_manager(p_event) then raise exception 'forbidden'; end if;
  update public.event_attendees set tier = p_tier where event_id = p_event and user_id = p_user returning * into v_att;
  if v_att.id is null then raise exception 'not_attendee'; end if;
  return v_att;
end $$;

-- [v1.10] ZONAS ── las ve quien está en el evento (el asistente ve a qué zonas puede pasar); las gestiona dueño/a o
-- producción (hasta 20 por evento). El registro de lecturas solo lo ve el personal de puerta; se escribe por RPC.
drop policy if exists zones_select on public.event_zones;
create policy zones_select on public.event_zones for select to authenticated
  using (public.is_event_attendee(event_id) or public.is_event_staff(event_id) or public.is_event_manager(event_id));
drop policy if exists zones_manage on public.event_zones;
create policy zones_manage on public.event_zones for all to authenticated
  using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));
revoke all on public.event_zones from anon;
create or replace function public.tg_zones_limit()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if (select count(*) from public.event_zones where event_id = new.event_id) >= 20 then raise exception 'too_many_zones'; end if;
  return new;
end $$;
drop trigger if exists zones_limit on public.event_zones;
create trigger zones_limit before insert on public.event_zones for each row execute function public.tg_zones_limit();

drop policy if exists zone_checkins_select on public.zone_check_ins;
create policy zone_checkins_select on public.zone_check_ins for select to authenticated
  using (public.has_staff_role(event_id, array['owner','manager','security']::staff_role_t[]));
revoke all on public.zone_check_ins from anon, authenticated;
grant select on public.zone_check_ins to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- [v1.8] PRIVACIDAD POR CONTEXTO (espejo: privacy.ts y faceOf en verticals.ts)
-- ════════════════════════════════════════════════════════════════════════

-- Nivel de acceso de `p_viewer` al perfil de `p_target` (⇔ profileAccess en privacy.ts):
--   'full' → se mostró con su Perfil principal en un evento de noche que compartimos (o es un match de noche, o soy yo).
--   'name' → compartimos algún contexto (evento corporativo, equipo, Squad, contacto, mi lista de bloqueados): solo nombre.
--   null   → ningún contexto o hay bloqueo: no se devuelve nada.
create or replace function public.profile_access(p_viewer uuid, p_target uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select case
    when p_viewer is null then null
    when p_viewer = p_target then 'full'
    when exists (select 1 from public.user_blocks b where b.blocker_id = p_viewer and b.blocked_user_id = p_target) then 'name'
    when public.is_blocked(p_viewer, p_target) then null
    when exists (
      select 1 from public.event_attendees a join public.events e on e.id = a.event_id
      where a.user_id = p_target and a.persona_id is null and e.kind::text = 'nightlife'
        and public.can_see_attendee(a.event_id, p_viewer, p_target)) then 'full'
    when exists (
      select 1 from public.connections c join public.events e on e.id = c.event_id
      where c.status = 'accepted' and e.kind::text = 'nightlife'
        and ((c.sender_id = p_viewer and c.receiver_id = p_target) or (c.sender_id = p_target and c.receiver_id = p_viewer))
        and not exists (select 1 from public.event_attendees a where a.event_id = c.event_id and a.user_id = p_target and a.persona_id is not null)) then 'full'
    when exists (select 1 from public.event_attendees a where a.user_id = p_target and public.can_see_attendee(a.event_id, p_viewer, p_target)) then 'name'
    when exists (select 1 from public.connections c where c.status = 'accepted'
                 and ((c.sender_id = p_viewer and c.receiver_id = p_target) or (c.sender_id = p_target and c.receiver_id = p_viewer))) then 'name'
    when exists (select 1 from public.meetings m where (m.requester_id = p_viewer and m.invitee_id = p_target) or (m.requester_id = p_target and m.invitee_id = p_viewer)) then 'name'
    when exists (select 1 from public.event_staff st where st.user_id = p_target
                 and (public.is_event_attendee(st.event_id, p_viewer) or public.is_event_staff(st.event_id, p_viewer))) then 'name'
    when exists (select 1 from public.events ev where ev.created_by = p_target
                 and (public.is_event_attendee(ev.id, p_viewer) or public.is_event_staff(ev.id, p_viewer))) then 'name'
    when exists (select 1 from public.event_bans bn where bn.user_id = p_target and public.is_event_manager(bn.event_id, p_viewer)) then 'name'
    when exists (select 1 from public.squad_members m1 join public.squad_members m2 on m2.squad_id = m1.squad_id
                 where m1.user_id = p_viewer and m2.user_id = p_target) then 'name'
    else null end;
$$;

-- Tarjetas públicas de perfiles (PublicProfileCard). Nunca: teléfono, email, fecha de nacimiento (solo edad), historial
-- de eventos. Con nivel 'name' solo nombre y verificado (sin @usuario, fotos ni datos de la noche).
create or replace function public.profile_cards(p_ids uuid[])
returns table (
  id uuid, username citext, full_name text, age int, gender gender_t, bio text, photos jsonb, loop_video_url text,
  music_genres text[], spotify_embed_url text, instagram_username text, instagram_verified boolean, is_verified boolean, created_at timestamptz
) language sql stable security definer set search_path = public, extensions as $$
  select p.id,
         case when x.lvl = 'full' then p.username end,
         p.full_name,
         case when x.lvl = 'full' then date_part('year', age(p.birth_date))::int end,
         case when x.lvl = 'full' then p.gender else 'undisclosed'::gender_t end,
         case when x.lvl = 'full' then p.bio else '' end,
         case when x.lvl = 'full' then p.photos else '[]'::jsonb end,
         case when x.lvl = 'full' then p.loop_video_url end,
         case when x.lvl = 'full' then p.music_genres else '{}'::text[] end,
         case when x.lvl = 'full' then p.spotify_embed_url end,
         case when x.lvl = 'full' then p.instagram_username::text end,
         x.lvl = 'full' and p.instagram_verified,
         p.is_verified,
         p.created_at
  from public.profiles p
  cross join lateral (select public.profile_access(auth.uid(), p.id) as lvl) x
  where p.id = any(p_ids) and x.lvl is not null;
$$;

-- ¿Ya hubo un contacto aceptado (en un evento corporativo) o una reunión aceptada entre los dos? (⇔ proUnlocked)
create or replace function public.pro_unlocked(p_viewer uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
      select 1 from public.meetings m where m.status = 'accepted'
        and ((m.requester_id = p_viewer and m.invitee_id = p_owner) or (m.requester_id = p_owner and m.invitee_id = p_viewer)))
    or exists (
      select 1 from public.connections c join public.events e on e.id = c.event_id
      where c.status = 'accepted' and e.kind::text = 'corporate'
        and ((c.sender_id = p_viewer and c.receiver_id = p_owner) or (c.sender_id = p_owner and c.receiver_id = p_viewer)));
$$;

-- [v1.10] ¿`p_viewer` ve el email y el teléfono de contacto de este perfil profesional? (⇔ personaContactVisible)
--   siempre tras una reunión o un contacto aceptado entre los dos; 'network' también quien asiste a un evento donde se usa;
--   'public' también el equipo y la organización de esos eventos. Nunca con bloqueo.
create or replace function public.persona_contact_visible(p_viewer uuid, p_persona uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select case
      when p.user_id = p_viewer then true
      when p.contact_email is null and p.contact_phone is null then false
      when public.is_blocked(p_viewer, p.user_id) then false
      when public.pro_unlocked(p_viewer, p.user_id) then true
      when p.privacy_level = 'strict' then false
      when exists (select 1 from public.event_attendees a where a.persona_id = p.id and public.is_event_attendee(a.event_id, p_viewer)) then true
      when p.privacy_level <> 'public' then false
      else exists (select 1 from public.event_attendees a where a.persona_id = p.id
                   and (public.is_event_manager(a.event_id, p_viewer) or public.is_event_staff(a.event_id, p_viewer)))
    end
    from public.profile_personas p where p.id = p_persona), false);
$$;

-- Perfiles adicionales de otros, saneados: sin el nombre interno; LinkedIn solo tras un contacto o reunión aceptada;
-- empresa y cargo ocultos hasta entonces si su dueño/a lo eligió. Dueño/a y producción del evento ven los datos
-- profesionales completos (CRM). Solo perfiles que se usan en un evento donde puedo ver a esa persona.
create or replace function public.persona_cards(p_ids uuid[])
returns setof public.profile_personas language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.user_id, p.kind,
         case when own then p.label else '' end,
         p.display_name, p.bio, p.photos, p.music_genres, p.spotify_embed_url,
         case when own or mgr or unlocked or not hide then p.job_title else '' end,
         case when own or mgr or unlocked or not hide then p.company else '' end,
         p.industry, p.looking_for, p.offering,
         case when own or mgr or unlocked then p.linkedin_url end,
         p.created_at,
         -- [v1.10] Ficha ejecutiva: sitio y detalle públicos; email y teléfono según privacy_level.
         p.website_url, p.looking_for_note, p.offering_note,
         case when contact then p.contact_email end,
         case when contact then p.contact_phone end,
         p.privacy_level
  from public.profile_personas p
  cross join lateral (select
      public.persona_contact_visible(auth.uid(), p.id) as contact,
      p.user_id = auth.uid() as own,
      exists (select 1 from public.event_attendees a where a.persona_id = p.id and public.is_event_manager(a.event_id, auth.uid())) as mgr,
      public.pro_unlocked(auth.uid(), p.user_id) as unlocked,
      coalesce((select ps.pro_details_after_meeting from public.privacy_settings ps where ps.user_id = p.user_id), false) as hide) f
  where p.id = any(p_ids)
    and (own or exists (select 1 from public.event_attendees a where a.persona_id = p.id and public.can_see_attendee(a.event_id, auth.uid(), a.user_id)));
$$;

-- Mis asistencias completas (gasto, cómo entré, ingreso, sectores): las columnas privadas no se leen por tabla.
create or replace function public.my_attendances()
returns setof public.event_attendees language sql stable security definer set search_path = public, extensions as $$
  select * from public.event_attendees where user_id = auth.uid();
$$;

-- Datos privados de la asistencia para el equipo: gasto, origen y RRPP solo dueño/a y producción; ingreso también seguridad.
create or replace function public.event_attendance(p_event uuid)
returns table (user_id uuid, total_spent numeric, joined_via join_via_t, referred_by uuid, checked_in_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_mgr boolean := public.is_event_manager(p_event); v_sec boolean;
begin
  v_sec := v_mgr or public.has_staff_role(p_event, array['owner','manager','security']::staff_role_t[]);
  if not v_sec then raise exception 'forbidden'; end if;
  return query select a.user_id,
    case when v_mgr then a.total_spent else 0 end,
    case when v_mgr then a.joined_via else 'master_link'::join_via_t end,
    case when v_mgr then a.referred_by end,
    a.checked_in_at
  from public.event_attendees a where a.event_id = p_event;
end $$;

-- "Coincidieron en tu zona" sin exponer dónde estuvo cada uno: solo los sectores EN COMÚN conmigo.
create or replace function public.shared_zones(p_event uuid)
returns table (user_id uuid, zones text[]) language sql stable security definer set search_path = public, extensions as $$
  select a.user_id, array(select unnest(a.visited_sectors) intersect select unnest(me.visited_sectors))
  from public.event_attendees a
  join public.event_attendees me on me.event_id = a.event_id and me.user_id = auth.uid()
  where a.event_id = p_event and a.user_id <> auth.uid() and public.can_see_attendee(p_event, auth.uid(), a.user_id);
$$;

-- PRIVACY SETTINGS ── cada uno los suyos.
drop policy if exists privacy_own on public.privacy_settings;
create policy privacy_own on public.privacy_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.privacy_settings from anon, authenticated;
grant select, insert, update on public.privacy_settings to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- [v1.8] REUNIONES 1 A 1 Y PUNTOS DE ENCUENTRO (espejo: engine/meetings.ts)
-- ════════════════════════════════════════════════════════════════════════

-- VENUE SPOTS ── los ve quien está en el evento (asistentes y equipo); los gestiona dueño/a o producción.
drop policy if exists spots_select on public.venue_spots;
create policy spots_select on public.venue_spots for select to authenticated
  using (public.is_event_attendee(event_id) or public.is_event_staff(event_id));
drop policy if exists spots_manage on public.venue_spots;
create policy spots_manage on public.venue_spots for all to authenticated
  using (public.is_event_manager(event_id)) with check (public.is_event_manager(event_id));

-- MEETINGS ── solo las dos personas (y nunca con bloqueo). Todo cambio va por RPC. El equipo ve conteos (event_stats).
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select to authenticated
  using ((requester_id = auth.uid() or invitee_id = auth.uid()) and not public.is_blocked(requester_id, invitee_id));
revoke insert, update, delete on public.meetings from anon, authenticated;

-- Reuniones aceptadas que pisan ese horario en esa sala/mesa (para el cupo).
create or replace function public.spot_busy(p_spot uuid, p_starts timestamptz, p_minutes int, p_exclude uuid default null)
returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from public.meetings m
  where m.spot_id = p_spot and m.status = 'accepted' and m.id is distinct from p_exclude
    and m.starts_at < p_starts + make_interval(mins => p_minutes)
    and p_starts < m.starts_at + make_interval(mins => m.duration_min);
$$;

-- ¿`p_user` ya tiene una reunión aceptada que se superpone?
create or replace function public.meeting_conflict(p_user uuid, p_starts timestamptz, p_minutes int, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.meetings m
    where m.status = 'accepted' and m.id is distinct from p_exclude and p_user in (m.requester_id, m.invitee_id)
      and m.starts_at < p_starts + make_interval(mins => p_minutes)
      and p_starts < m.starts_at + make_interval(mins => m.duration_min));
$$;

-- Valida horario y lugar de una reunión (usado al pedir, reprogramar y aceptar). Lanza la excepción del problema.
create or replace function public.check_meeting_slot(p_event uuid, p_starts timestamptz, p_minutes int, p_kind text,
                                                     p_spot uuid, p_x double precision, p_y double precision, p_exclude uuid default null)
returns void language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev public.events; v_spot public.venue_spots;
begin
  select * into v_ev from public.events where id = p_event;
  if p_minutes not in (15, 30) then raise exception 'invalid_duration'; end if;
  if p_starts < now() - interval '2 minutes' or p_starts < v_ev.starts_at - interval '1 minute'
     or p_starts + make_interval(mins => p_minutes) > v_ev.ends_at then raise exception 'invalid_time'; end if;
  if p_kind = 'spot' then
    select * into v_spot from public.venue_spots where id = p_spot and event_id = p_event and is_active;
    if v_spot.id is null then raise exception 'invalid_spot'; end if;
    if v_spot.capacity is not null and public.spot_busy(p_spot, p_starts, p_minutes, p_exclude) >= v_spot.capacity then raise exception 'spot_busy'; end if;
  elsif p_kind = 'pin' then
    if p_x is null or p_y is null or p_x not between 0 and 100 or p_y not between 0 and 100 then raise exception 'invalid_pin'; end if;
  elsif p_kind <> 'tbd' then raise exception 'invalid_location';
  end if;
end $$;

-- Pedir una reunión ("Solicitar reunión" en corporativo, "Punto de encuentro" con un match en la noche).
create or replace function public.request_meeting(p_event uuid, p_invitee uuid, p_topic text, p_starts_at timestamptz, p_duration int,
                                                  p_location_kind text default 'tbd', p_spot uuid default null,
                                                  p_x double precision default null, p_y double precision default null, p_label text default null)
returns public.meetings language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_ev public.events; v_row public.meetings; v_ghost boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_ev from public.events where id = p_event;
  if not public.lobby_is_open(p_event) then raise exception 'lobby_closed'; end if;
  if v_uid = p_invitee then raise exception 'not_allowed'; end if;
  if not public.is_event_attendee(p_event, v_uid) or not public.is_event_attendee(p_event, p_invitee) then raise exception 'not_attendee'; end if;
  if not public.can_see_attendee(p_event, v_uid, p_invitee) then raise exception 'unavailable'; end if;
  if not public.networking_open_for(p_event, v_uid) then raise exception 'checkin_required'; end if;
  -- Noche: solo con matches (seguridad: nadie recibe una cita de un desconocido). Corporativo: con cualquiera visible.
  if v_ev.kind::text = 'nightlife' and not public.is_match(p_event, v_uid, p_invitee) then raise exception 'match_required'; end if;
  select ghost_mode into v_ghost from public.event_attendees where event_id = p_event and user_id = v_uid;
  if v_ghost and not public.is_match(p_event, v_uid, p_invitee) then raise exception 'sender_in_ghost_mode'; end if;
  if coalesce(trim(p_topic), '') = '' or char_length(trim(p_topic)) > 140 then raise exception 'invalid_message'; end if;
  if exists (select 1 from public.meetings where event_id = p_event and status in ('pending','rescheduled')
             and ((requester_id = v_uid and invitee_id = p_invitee) or (requester_id = p_invitee and invitee_id = v_uid))) then
    raise exception 'meeting_pending';
  end if;
  if (select count(*) from public.meetings where event_id = p_event and requester_id = v_uid and status = 'pending') >= 10 then raise exception 'too_many_requests'; end if;
  perform public.check_meeting_slot(p_event, p_starts_at, p_duration, p_location_kind, p_spot, p_x, p_y);
  if public.meeting_conflict(v_uid, p_starts_at, p_duration) then raise exception 'time_conflict'; end if;
  insert into public.meetings (event_id, requester_id, invitee_id, topic, starts_at, duration_min, location_kind, spot_id, pin_x, pin_y, pin_label, proposed_by)
  values (p_event, v_uid, p_invitee, trim(p_topic), p_starts_at, p_duration, p_location_kind,
          case when p_location_kind = 'spot' then p_spot end,
          case when p_location_kind = 'pin' then p_x end, case when p_location_kind = 'pin' then p_y end,
          case when p_location_kind = 'pin' then nullif(left(trim(p_label), 60), '') end, v_uid)
  returning * into v_row;
  return v_row;
end $$;

-- Aceptar o rechazar (responde quien NO hizo la última propuesta). Al aceptar: valida cupo y agenda de los dos, abre el
-- chat (conexión aceptada) y deja la reunión fijada en el chat. Si el lugar estaba "a definir", se puede elegir acá.
create or replace function public.respond_meeting(p_meeting uuid, p_accept boolean, p_location_kind text default null, p_spot uuid default null,
                                                  p_x double precision default null, p_y double precision default null, p_label text default null)
returns public.meetings language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_m public.meetings; v_conn public.connections; v_spot text;
begin
  select * into v_m from public.meetings where id = p_meeting for update;
  if v_m.id is null or v_uid not in (v_m.requester_id, v_m.invitee_id) then raise exception 'not_found'; end if;
  if v_m.status not in ('pending','rescheduled') then raise exception 'final_status'; end if;
  if v_m.proposed_by = v_uid then raise exception 'not_allowed'; end if;
  if public.is_blocked(v_m.requester_id, v_m.invitee_id) then raise exception 'unavailable'; end if;
  if not p_accept then
    update public.meetings set status = 'declined', updated_at = now() where id = p_meeting returning * into v_m;
    return v_m;
  end if;
  if v_m.location_kind = 'tbd' and p_location_kind is not null and p_location_kind <> 'tbd' then
    v_m.location_kind := p_location_kind;
    v_m.spot_id := case when p_location_kind = 'spot' then p_spot end;
    v_m.pin_x := case when p_location_kind = 'pin' then p_x end;
    v_m.pin_y := case when p_location_kind = 'pin' then p_y end;
    v_m.pin_label := case when p_location_kind = 'pin' then nullif(left(trim(p_label), 60), '') end;
  end if;
  if v_m.starts_at + make_interval(mins => v_m.duration_min) <= now() then raise exception 'meeting_expired'; end if;
  perform public.check_meeting_slot(v_m.event_id, greatest(v_m.starts_at, now()), v_m.duration_min, v_m.location_kind, v_m.spot_id, v_m.pin_x, v_m.pin_y, v_m.id);
  if public.meeting_conflict(v_m.requester_id, v_m.starts_at, v_m.duration_min, v_m.id)
     or public.meeting_conflict(v_m.invitee_id, v_m.starts_at, v_m.duration_min, v_m.id) then raise exception 'time_conflict'; end if;

  -- Canal de chat: la conexión entre los dos queda aceptada (si había una pendiente, se acepta).
  select * into v_conn from public.connections
   where event_id = v_m.event_id and ((sender_id = v_m.requester_id and receiver_id = v_m.invitee_id) or (sender_id = v_m.invitee_id and receiver_id = v_m.requester_id))
   order by (status = 'accepted') desc, created_at desc limit 1;
  if v_conn.id is null then
    insert into public.connections (event_id, sender_id, receiver_id, type, status, responded_at)
    values (v_m.event_id, v_m.requester_id, v_m.invitee_id, 'regular', 'accepted', now()) returning * into v_conn;
  elsif v_conn.status <> 'accepted' then
    update public.connections set status = 'accepted', responded_at = now() where id = v_conn.id returning * into v_conn;
  end if;

  update public.meetings set status = 'accepted', location_kind = v_m.location_kind, spot_id = v_m.spot_id, pin_x = v_m.pin_x, pin_y = v_m.pin_y,
         pin_label = v_m.pin_label, connection_id = v_conn.id, updated_at = now()
   where id = p_meeting returning * into v_m;
  select name into v_spot from public.venue_spots where id = v_m.spot_id;
  insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content)
  values (v_m.event_id, 'direct', v_conn.id, v_uid, 'system_alert',
          '📅 Reunión confirmada · ' || to_char(v_m.starts_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') || ' · ' ||
          coalesce(v_spot, v_m.pin_label, case when v_m.location_kind = 'pin' then 'Pin en el plano' else 'Lugar a definir' end));
  return v_m;
end $$;

-- Reprogramar (cualquiera de los dos): nueva propuesta que la otra persona tiene que aceptar.
create or replace function public.reschedule_meeting(p_meeting uuid, p_starts_at timestamptz, p_duration int, p_location_kind text default 'tbd',
                                                     p_spot uuid default null, p_x double precision default null, p_y double precision default null, p_label text default null)
returns public.meetings language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_m public.meetings;
begin
  select * into v_m from public.meetings where id = p_meeting for update;
  if v_m.id is null or v_uid not in (v_m.requester_id, v_m.invitee_id) then raise exception 'not_found'; end if;
  if v_m.status not in ('pending','accepted','rescheduled') then raise exception 'final_status'; end if;
  if not public.lobby_is_open(v_m.event_id) then raise exception 'lobby_closed'; end if;
  perform public.check_meeting_slot(v_m.event_id, p_starts_at, p_duration, p_location_kind, p_spot, p_x, p_y, v_m.id);
  if public.meeting_conflict(v_uid, p_starts_at, p_duration, v_m.id) then raise exception 'time_conflict'; end if;
  update public.meetings set status = 'rescheduled', proposed_by = v_uid, starts_at = p_starts_at, duration_min = p_duration,
         location_kind = p_location_kind,
         spot_id = case when p_location_kind = 'spot' then p_spot end,
         pin_x = case when p_location_kind = 'pin' then p_x end, pin_y = case when p_location_kind = 'pin' then p_y end,
         pin_label = case when p_location_kind = 'pin' then nullif(left(trim(p_label), 60), '') end, updated_at = now()
   where id = p_meeting returning * into v_m;
  return v_m;
end $$;

-- Cancelar (cualquiera de los dos, antes de que termine).
create or replace function public.cancel_meeting(p_meeting uuid)
returns public.meetings language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_m public.meetings;
begin
  select * into v_m from public.meetings where id = p_meeting for update;
  if v_m.id is null or v_uid not in (v_m.requester_id, v_m.invitee_id) then raise exception 'not_found'; end if;
  if v_m.status not in ('pending','accepted','rescheduled') then raise exception 'final_status'; end if;
  update public.meetings set status = 'cancelled', updated_at = now() where id = p_meeting returning * into v_m;
  return v_m;
end $$;

-- Permisos de ejecución
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
-- Postgres concede EXECUTE a PUBLIC por defecto: las funciones internas se cierran también para PUBLIC.
revoke execute on function public.purge_expired_pins() from public, anon, authenticated;
revoke execute on function public.apply_squad_perk_rules(uuid) from public, anon, authenticated;
revoke execute on function public.apply_order_spend(public.bar_orders) from public, anon, authenticated;
grant execute on function public.resolve_access_code(text) to anon;
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
                           'brands','squad_expenses','squad_settlements','profile_personas','meetings','venue_spots',
                           'event_zones','zone_check_ins'] loop
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
