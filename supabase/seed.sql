-- ════════════════════════════════════════════════════════════════════════
--  ROUGE — Datos iniciales opcionales (correr DESPUÉS de schema.sql)
--  Evento de prueba "en vivo" (fechas relativas a now()), menú de Barra Express
--  y regla "Squad de 4 → trago". Idempotente: se puede correr varias veces.
--
--  Para operar el panel /admin de este evento con tu cuenta:
--    insert into public.event_staff (event_id, user_id, role)
--    select id, '<TU-USER-ID>'::uuid, 'owner' from public.events where slug = 'bresh-sabado'
--    on conflict do nothing;
--  (Tu user id está en Authentication → Users. Los eventos que crees desde /admin
--   ya te tienen como staff automáticamente.)
-- ════════════════════════════════════════════════════════════════════════

insert into public.events (id, slug, name, description, venue_name, venue_layout_json, lineup_json,
                           starts_at, ends_at, lobby_opens_at, lobby_expires_at, max_capacity, master_invite_code)
values (
  '00000000-0000-4000-8000-000000001000', 'bresh-sabado', 'ROUGE Night × Bresh Sábado',
  'La noche más grande del mes. Line-up de house y techno, Mesa VIP, Barra Express y sorteos en vivo.',
  'Club Crobar · Palermo',
  '{"aspect":0.75,"sectors":[
    {"id":"booth","name":"Cabina DJ","kind":"booth","x":36,"y":4,"w":28,"h":7},
    {"id":"wc","name":"Baños","kind":"restroom","x":76,"y":4,"w":20,"h":7},
    {"id":"coat","name":"Guardarropa","kind":"lounge","x":4,"y":4,"w":20,"h":7},
    {"id":"floor","name":"Pista Principal","kind":"dancefloor","x":8,"y":15,"w":84,"h":33},
    {"id":"bar","name":"Barra Central","kind":"bar","x":30,"y":52,"w":40,"h":9},
    {"id":"patio","name":"Patio Terraza","kind":"outdoor","x":4,"y":52,"w":22,"h":31},
    {"id":"bar-terraza","name":"Barra Terraza","kind":"bar","x":6,"y":55,"w":18,"h":7},
    {"id":"vip","name":"Sector VIP","kind":"vip","x":74,"y":52,"w":22,"h":31},
    {"id":"lounge","name":"Lounge","kind":"lounge","x":30,"y":65,"w":40,"h":18},
    {"id":"entry","name":"Entrada","kind":"entrance","x":36,"y":87,"w":28,"h":9}]}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('id','set-1','artist','Sol Ortega','genre','House','starts_at', now() - interval '2 hours','ends_at', now() - interval '30 minutes'),
    jsonb_build_object('id','set-2','artist','DJ Invitado: Kaleb Rivas','genre','Techno','starts_at', now() - interval '30 minutes','ends_at', now() + interval '1 hour'),
    jsonb_build_object('id','set-3','artist','Main Set: NOX B2B Lumen','genre','Techno','is_headliner', true,'starts_at', now() + interval '1 hour','ends_at', now() + interval '150 minutes'),
    jsonb_build_object('id','set-4','artist','Closing: Marea','genre','House','starts_at', now() + interval '150 minutes','ends_at', now() + interval '4 hours')
  ),
  now() - interval '2 hours', now() + interval '4 hours', now() - interval '50 hours', now() + interval '28 hours', 1800, 'BRESH26'
)
on conflict (id) do update set
  lineup_json = excluded.lineup_json, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  lobby_opens_at = excluded.lobby_opens_at, lobby_expires_at = excluded.lobby_expires_at;

insert into public.bar_menu_items (id, event_id, name, category, price, emoji) values
  ('fernet',        '00000000-0000-4000-8000-000000001000', 'Fernet con Coca',         'trago',       6500,  '🥃'),
  ('gin',           '00000000-0000-4000-8000-000000001000', 'Gin Tonic',               'trago',       8000,  '🍸'),
  ('speed',         '00000000-0000-4000-8000-000000001000', 'Vodka Speed',             'trago',       7500,  '⚡'),
  ('aperol',        '00000000-0000-4000-8000-000000001000', 'Aperol Spritz',           'trago',       8500,  '🍊'),
  ('ipa',           '00000000-0000-4000-8000-000000001000', 'Cerveza IPA',             'cerveza',     5000,  '🍺'),
  ('agua',          '00000000-0000-4000-8000-000000001000', 'Agua sin gas',            'sin_alcohol', 2500,  '💧'),
  ('energy',        '00000000-0000-4000-8000-000000001000', 'Energizante',             'sin_alcohol', 3500,  '🔋'),
  ('combo-fernet',  '00000000-0000-4000-8000-000000001000', 'Combo 4 Fernets',         'combo',       22000, '🎉'),
  ('botella-vodka', '00000000-0000-4000-8000-000000001000', 'Botella Vodka + 4 Speed', 'botella',     95000, '🍾'),
  ('champagne',     '00000000-0000-4000-8000-000000001000', 'Champagne Brut',          'botella',     60000, '🥂')
on conflict (event_id, id) do nothing;

insert into public.perk_rules (id, event_id, title, perk_type, trigger, is_active)
values ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-000000001000',
        '🍹 Trago de Bienvenida — Squad de 4+', 'free_drink',
        jsonb_build_object('kind', 'squad_size', 'min_members', 4, 'before', now() + interval '2 hours'), true)
on conflict (id) do nothing;
