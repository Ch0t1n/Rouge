# Base de datos (Supabase)

Todo el backend está en un solo archivo idempotente: [`supabase/schema.sql`](../../supabase/schema.sql) (tablas,
índices, RLS, RPCs, triggers, Realtime y Storage). Se puede volver a ejecutar sin perder datos. Los tipos de
TypeScript (`src/lib/types.ts`) son su espejo 1:1.

## Tablas

| Tabla | Contenido |
|---|---|
| `profiles` | Perfil persistente (nombre, @username, nacimiento +18, género, teléfono E.164 privado, bio, fotos, loop, géneros, Spotify, Instagram, verificado). |
| `instagram_accounts` | Conexión de Instagram con su token. **Solo servidor** (RLS sin políticas). |
| `user_blocks` | Lista negra por perfil o por teléfono. |
| `events` | Evento: horarios, ventana del lobby, cupo, plano, line-up, link maestro, creador. |
| `event_staff` | Equipo del evento y su rol (`owner`, `manager`, `bartender`, `waiter`, `security`). |
| `event_invite_codes` | Códigos de 1 uso: entrada externa (`external_ref`, única por evento), etiqueta, origen (panel / API), anulación. |
| `api_keys` | Claves de la API v1 (solo el SHA-256; nombre, prefijo visible, alcance de evento, permisos, último uso, revocada). |
| `event_attendees` | Asistencia: mood, Modo Solo Amigos, Rompehielos usado, gasto, sectores visitados. |
| `connections` | Conectar / Rompehielos (con trago adjunto) y su estado. |
| `squads` · `squad_members` | Squads, Punto Base, Mesa VIP; integrantes y estado de seguridad. |
| `map_pins` | Pines de 15 min con audiencia (Squad / matches elegidos) y alertas de rescate. |
| `messages` | Chats 1:1 y del Squad (texto, foto, alertas del sistema). |
| `event_blasts` · `blast_deliveries` | Avisos del organizador y a quién le llegaron. |
| `user_perks_qrs` · `perk_rules` | QRs de cada asistente y reglas de QR Drop. |
| `raffles` | Sorteos y ganador. |
| `song_requests` | Pedidos de temas y votos. |
| `bar_menu_items` · `bar_orders` | Menú del evento y pedidos (estado, código de retiro, compartido `split_user_ids`, estado de pago `payment_status` / `payment_ref` / `paid_at`). |
| `brands` | Marca: dueño/a, nombre, logo, colores (validados por `brand_color_error`) y `payments_enabled` (solo servidor). |
| `brand_payment_accounts` | Cuenta de Mercado Pago de la marca con tokens **cifrados**. **Solo servidor** (RLS sin políticas). |
| `squad_expenses` · `squad_settlements` | Cuentas de la mesa: gastos cargados a mano y transferencias entre integrantes. |
| `payout_aliases` | Alias o CBU/CVU para cobrar (visible solo para quienes comparten un Squad). |
| `promoter_links` | Link propio de cada RRPP por evento (`code` RP…, comisión por ingreso). `event_attendees.referred_by` guarda la atribución. |
| `event_bans` | Expulsados de un evento (no pueden volver a entrar a ese evento). Altas por `remove_attendee`. |
| `privacy_settings` | **[v1.8]** Ajustes de la cuenta: `incognito_default`, `pin_share_matches`, `pro_details_after_meeting`. RLS: cada uno los suyos. |
| `venue_spots` | **[v1.8]** Salas, mesas y puntos de encuentro del evento (tipo, cupo de reuniones a la vez, posición en el plano, activo). Los ven asistentes y equipo; los gestiona dueño/a o producción. |
| `meetings` | **[v1.8]** Reuniones 1 a 1: motivo, horario, 15/30 min, lugar (`spot` / `pin` / `tbd`), estado (`pending`, `accepted`, `rescheduled`, `declined`, `cancelled`; "completada" se deriva), quién propuso por última vez y chat. Solo las ven las dos personas; todo cambio por RPC. |
| `b2b_leads` | **[v1.8]** Leads de `/empresas`. **Solo servidor** (RLS sin políticas). |
| `profile_personas` | **[v1.7]** Perfiles adicionales de una cuenta (`kind` noche / corporativo): nombre visible, fotos, géneros y Spotify, o cargo, empresa, rubro, `looking_for` / `offering` y LinkedIn. Máx. 5 por cuenta (`personas_limit`). Legible solo por quien comparte con su dueño/a un evento donde se usó. |

`events` suma `brand_id` (de quien creó el evento: trigger `events_brand_owner`), `logo_url`, `theme_primary` y `theme_accent`.
**[v1.7]** `events.kind` (`event_kind_t`: `nightlife` | `corporate`) y `event_attendees.persona_id` (perfil con el que se
muestra en ese evento; `null` = Perfil principal, solo en la noche).

## Funciones (RPCs)

Toda operación sensible pasa por una función `security definer` que valida la regla en el servidor (espejo del motor).

**Asistentes**

| RPC | Para qué |
|---|---|
| `my_profile()` | Mi perfil completo (incluye mi teléfono). |
| `my_instagram()` | Mi Instagram conectado (sin token). |
| `resolve_access_code(code)` | Vista previa de un código o link (también sin sesión). |
| `join_event(code, mood)` | Ingreso por slug, código maestro, código de 1 uso o link de Squad. |
| `event_grid(event)` | Grilla con afinidad y zonas en común. |
| `send_connection(event, receiver)` | Conectar (match si es recíproco). |
| `send_icebreaker(event, receiver, message, gift_item)` | Rompehielos (uno por evento) con trago opcional. |
| `create_squad` · `invite_to_squad` · `join_squad` | Squads. |
| `drop_pin(event, x, y, sector, share_with_squad, match_ids, note)` | Pin de 15 min (descarta ids que no son matches). |
| `trigger_rescue(event, x, y, sector)` · `set_safety_status(event, status)` | Rescate y "llegué a casa". |
| `set_squad_base_pin` · `announce_base_meetup` | Punto Base y su aviso. |
| `create_bar_order(event, items, delivery)` | Pedido con precios del servidor y código de retiro. |
| `vote_song(event, title, artist)` | Pedir / votar tema. |

**Equipo**

| RPC | Quién | Para qué |
|---|---|---|
| `send_blast(...)` | Dueño/a, Producción | Text Blast / Flash Promo segmentado (devuelve el alcance). |
| `draw_raffle(raffle)` | Dueño/a, Producción | Ganador con `random()` + QR de premio. |
| `generate_invite_codes(event, count)` | Dueño/a, Producción | Lote de códigos de 1 uso. |
| `event_crm(event)` | Dueño/a, Producción | CRM con teléfonos. |
| `event_stats(event)` | Dueño/a, Producción, Seguridad | Conteos agregados (sin revelar quién hizo match con quién). |
| `advance_bar_order(order)` | Dueño/a, Producción, Barra, Mozo/a | Avanza la comanda según su flujo. |
| `redeem_pickup_code(event, code)` | Dueño/a, Producción, Barra, Mozo/a | Entrega en la ventanilla (solo si está lista). |
| `redeem_perk(qr)` | Dueño/a, Producción, Barra | Canje de QR de perk. |
| `set_staff_role(event, username, role)` | Dueño/a | Sumar, cambiar o quitar equipo. |
| `create_api_key(name, event, scopes)` · `revoke_api_key(id)` | Dueño/a, Producción | Claves de la API (la clave completa vuelve una sola vez). |

**API v1 (solo servidor, `service_role`)** — cerradas para `public`, `anon` y `authenticated`:

| RPC | Para qué |
|---|---|
| `api_authorize(key, event, scope)` | Clave activa + alcance + quien la creó sigue siendo dueño/a o producción. |
| `api_key_events(key)` | Eventos que puede usar una clave. |
| `api_issue_codes(key, event, count, tickets, label)` | Emite códigos por cantidad o uno por entrada (idempotente por `external_ref`). |
| `api_revoke_code(key, event, code)` | Anula un código no usado. |

`new_access_code()` genera los códigos (10 caracteres, alfabeto de 32 sin 0/O/1/I).

**Helpers de permisos (schema `private`, fuera de la API):** `is_blocked`, `is_event_attendee`, `is_event_staff`,
`has_staff_role`, `is_event_manager`, `can_operate_bar`, `is_squad_member`, `user_squad`, `are_squadmates`, `is_match`,
`squad_event`, `can_see_pin`, `lobby_is_open`, más `request_key` y `too_many_code_failures` (anti fuerza bruta). Los usan
las políticas y las RPCs; no se pueden llamar por `/rpc` (antes `is_blocked(a, b)` o `is_match` con ids ajenos revelaban
bloqueos y matches). Referencialos siempre como `private.<helper>(…)`.

**Escrituras directas permitidas** (todo lo demás va por RPC): perfil propio (sin `is_verified`), lista negra propia,
ajustes de asistente (`mood_tag`, `ghost_mode`, `only_liked_can_icebreak`, `last_active_at` — recortado a "ahora"), aceptar o
rechazar una solicitud recibida, nombre y Mesa VIP del Squad, salir de un Squad, borrar mi pin, mensajes de texto o foto
(foto solo de `chat-media/<mi id>/`), marcar un blast como visto; staff: eventos (sin `created_by` ni código maestro),
menú, reglas de perks, sorteos (sin ganador), códigos de 1 uso y equipo (solo dueño/a). Pines, pedidos de barra, QRs y el
avance de comandas **no** aceptan insert/update directo.

**Límites del servidor (anti abuso):** 20 códigos inválidos en 15 min por usuario o IP ⇒ `too_many_attempts`
(`join_event` devuelve `null` ante un código inexistente para registrar el intento); 40 solicitudes de conexión cada 10 min
⇒ `slow_down`; Text Blasts con título ≤ 80, mensaje ≤ 280, Flash Promo de 1 a 240 min y link interno o `https://`.

**Tabla interna `access_code_failures`:** intentos fallidos de códigos (RLS sin políticas; se limpia sola a las 24 h). No
forma parte del estado del cliente (`RougeState`).

**Triggers:** Rompehielos aceptado → su texto es el primer mensaje del chat; integrante nuevo o regla nueva → QR Drops; pin → sector
visitado; pedidos → `updated_at`; perfil → Instagram verificado (`profile_instagram`).

**Mantenimiento:** `purge_expired_pins()` (programar con `pg_cron` cada 5 min).

### Marca, cobros y cuentas de la mesa (v1.4)

| Función | Quién | Qué hace |
|---|---|---|
| `brand_color_error(hex, kind)` / `color_luminance(hex)` | checks | Mismo control de contraste que `checkBrandColor()` del motor. |
| `create_bar_order(..., p_split)` | asistente | Pedido compartido con integrantes; nace `awaiting_payment` si la marca cobra online. |
| `confirm_order_payment(order, ref, amount)` | **solo service role** | Acredita el pago verificado con Mercado Pago (idempotente, monto exacto) y suma el gasto. |
| `cancel_unpaid_order(order)` | quien pidió | Cancela un pedido que todavía no se pagó. |
| `my_brand_payments()` | dueño/a de la marca | Estado de la cuenta de cobro, sin tokens. |
| `add_squad_expense` · `record_settlement` · `respond_settlement` | integrantes | Cuentas de la mesa (validan integrantes y montos). |
| `shares_squad(user)` | RLS | ¿Comparto un Squad con esa persona? (alias para cobrar). |

`advance_bar_order` y `redeem_pickup_code` rechazan pedidos que esperan pago (`not_paid`).

### Verticales y perfiles adicionales (v1.7)

| Función / trigger | Quién | Qué hace |
|---|---|---|
| `join_event(code, mood, p_persona)` | asistente | Valida mood de la vertical (`invalid_mood`), perfil propio del mismo tipo (`invalid_persona`) y perfil obligatorio en corporativo (`persona_required`). |
| `mood_kind(mood)` | checks | Vertical de un mood (los `pro_*` son corporativos). |
| `business_affinity(...)` | `event_grid` | Afinidad de negocio, espejo de `businessAffinity()` del motor. |
| `event_grid(event)` | asistente | Devuelve la **cara del evento** (perfil elegido; neutra en corporativo si no hay perfil profesional). |
| `delete_persona(persona)` | dueño/a del perfil | Borra un perfil que no se usa en un evento con el lobby abierto (`persona_in_use`). |
| trigger `events_kind_locked` | — | El tipo de evento no cambia si ya entró alguien (`kind_locked`). |
| trigger `attendee_vertical` | — | Mood y perfil del asistente siempre de la vertical del evento (también si el cliente cambia el mood directo). |
| `not_in_vertical` | — | `send_icebreaker` (con trago), `vote_song`, `draw_raffle` (por género) y `ensure_promoter_link` en un evento corporativo. |

### Privacidad por contexto y reuniones (v1.8)

| Función | Quién | Qué hace |
|---|---|---|
| `profiles_select` (RLS) | — | Cada uno lee **solo su fila**. Los demás perfiles salen de `profile_cards`. |
| `profile_access(viewer, target)` | interna | `full` si se mostró con su Perfil principal en un evento de noche que comparten (o match de noche); `name` si comparten otro contexto; `null` si nada o bloqueo. |
| `profile_cards(ids)` | asistente | Tarjetas saneadas: edad (nunca fecha), sin teléfono; con `name`, solo nombre. |
| `persona_cards(ids)` | asistente | Perfiles adicionales ajenos sin nombre interno; LinkedIn solo tras reunión/contacto aceptado (`pro_unlocked`); empresa/cargo según `pro_details_after_meeting`. |
| `can_see_attendee(event, viewer, target)` | RLS | Base de `attendees_select`: bloqueos, Modo Solo Amigos, networking solo para acreditados (`events.networking_checkin_only`). |
| `my_attendances()` · `event_attendance(event)` · `shared_zones(event)` | asistente / equipo | Columnas privadas de `event_attendees` (por tabla solo se leen las públicas, también en Realtime). |
| `request_meeting` · `respond_meeting` · `reschedule_meeting` · `cancel_meeting` | participantes | Reuniones: horario dentro del evento, cupo de la sala (`spot_busy`), agenda sin superposiciones (`meeting_conflict`), en la noche solo con matches; al aceptar abre el chat y fija la reunión. |
| `drop_pin` | asistente | Respeta `pin_share_matches` (`pin_squad_only`). |
| `join_event` | asistente | Entra en Modo Solo Amigos si `incognito_default`. |

Los valores nuevos del enum `mood_tag_t` se agregan con `alter type … add value` y en el script se comparan como texto
(`mood::text`), igual que `promoter`, para que `schema.sql` se pueda aplicar en una sola transacción.

## Storage

| Bucket | Uso | Acceso |
|---|---|---|
| `profile-media` | Fotos y loops de perfil | Lectura pública; cada usuario escribe solo en su carpeta. |
| `chat-media` | Fotos de chats (privado) | Cada usuario escribe en su carpeta; la lee quien la subió y quien puede ver un mensaje que la usa (participantes del 1:1 o del Squad). |
| `venue-maps` | Planos subidos | Lectura pública; escribe Dueño/a o Producción del evento. |

Ningún bucket acepta SVG (puede llevar scripts). Tipos y tamaños se re-aplican en cada corrida de `schema.sql`.

## Realtime

Publicadas en `supabase_realtime`: `messages`, `map_pins`, `connections`, `squad_members`, `squads`,
`blast_deliveries`, `user_perks_qrs`, `bar_orders`, `song_requests`, `raffles`, `event_attendees`, `brands`,
`squad_expenses`, `squad_settlements` y `profile_personas`. Realtime respeta
RLS: cada usuario solo recibe lo que puede ver.

## Reglas para cambiar el esquema

- Las extensiones viven en el schema `extensions`; toda función `security definer` usa
  `set search_path = public, extensions`.
- RPCs que devuelven filas: `select * from fn(...)`, nunca `select (fn(...)).*`.
- Columnas nuevas en tablas existentes: `alter table ... add column if not exists`.
- Tabla nueva ⇒ actualizar `types.ts`, `RougeState`, `seed.ts`, `sync.ts` y `schema.sql`.
- Postgres concede `EXECUTE` a `PUBLIC` por defecto: una función que no debe usar el cliente se cierra con
  `revoke execute ... from public, anon, authenticated` (ver el final de `schema.sql`).
- Antes de cada cambio: `npm test` (contrato) y `npm run test:integration` contra un Supabase de prueba.
- `supabase/seed.sql` (opcional) crea el evento de prueba `/join/bresh-sabado`, su menú y una regla de QR, con fechas
  relativas a `now()`.
