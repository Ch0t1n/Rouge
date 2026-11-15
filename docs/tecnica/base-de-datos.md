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
| `event_invite_codes` | Códigos de 1 uso. |
| `event_attendees` | Asistencia: mood, Modo Solo Amigos, Rompehielos usado, gasto, sectores visitados. |
| `connections` | Conectar / Rompehielos (con trago adjunto) y su estado. |
| `squads` · `squad_members` | Squads, Punto Base, Mesa VIP; integrantes y estado de seguridad. |
| `map_pins` | Pines de 15 min con audiencia (Squad / matches elegidos) y alertas de rescate. |
| `messages` | Chats 1:1 y del Squad (texto, foto, alertas del sistema). |
| `event_blasts` · `blast_deliveries` | Avisos del organizador y a quién le llegaron. |
| `user_perks_qrs` · `perk_rules` | QRs de cada asistente y reglas de QR Drop. |
| `raffles` | Sorteos y ganador. |
| `song_requests` | Pedidos de temas y votos. |
| `bar_menu_items` · `bar_orders` | Menú del evento y pedidos (estado, código de retiro, vaquita). |

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

**Helpers de permisos:** `is_blocked`, `is_event_attendee`, `is_event_staff`, `has_staff_role`, `is_event_manager`,
`can_operate_bar`, `is_squad_member`, `are_squadmates`, `is_match`, `can_see_pin`, `lobby_is_open`.

**Triggers:** Rompehielos aceptado → su texto es el primer mensaje del chat; integrante nuevo o regla nueva → QR Drops; pin → sector
visitado; pedidos → `updated_at`; perfil → Instagram verificado (`profile_instagram`).

**Mantenimiento:** `purge_expired_pins()` (programar con `pg_cron` cada 5 min).

## Storage

| Bucket | Uso | Acceso |
|---|---|---|
| `profile-media` | Fotos y loops de perfil | Lectura pública; cada usuario escribe solo en su carpeta. |
| `chat-media` | Fotos de chats | Cada usuario escribe en su carpeta; lectura para cualquier usuario autenticado que tenga la URL (rutas con UUID, no adivinables). |
| `venue-maps` | Planos subidos | Lectura pública; escribe Dueño/a o Producción del evento. |

## Realtime

Publicadas en `supabase_realtime`: `messages`, `map_pins`, `connections`, `squad_members`, `squads`,
`blast_deliveries`, `user_perks_qrs`, `bar_orders`, `song_requests`, `raffles`, `event_attendees`. Realtime respeta
RLS: cada usuario solo recibe lo que puede ver.

## Reglas para cambiar el esquema

- Las extensiones viven en el schema `extensions`; toda función `security definer` usa
  `set search_path = public, extensions`.
- RPCs que devuelven filas: `select * from fn(...)`, nunca `select (fn(...)).*`.
- Columnas nuevas en tablas existentes: `alter table ... add column if not exists`.
- Tabla nueva ⇒ actualizar `types.ts`, `RougeState`, `seed.ts`, `sync.ts` y `schema.sql`.
- Antes de cada cambio: `npm test` (contrato) y `npm run test:integration` contra un Supabase de prueba.
- `supabase/seed.sql` (opcional) crea el evento de prueba `/join/bresh-sabado`, su menú y una regla de QR, con fechas
  relativas a `now()`.
