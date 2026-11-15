# ROUGE — Guía de arquitectura para Claude Code

ROUGE es una **PWA social y operativa para eventos, fiestas y discotecas (B2B2C)**.
Los asistentes entran a un lobby privado del evento (link maestro o código de 1 uso),
conectan con gente afín, arman su **Squad** (seguridad grupal + perks), se ubican en el
**plano** con pines de 15 min y piden en la **Barra Express**. El organizador paga
(fee por evento / por asistente activo / comisión de barra-VIP) y opera todo desde `/admin`.

> **Tesis:** ROUGE gana cuando la gente conecta rápido, no pierde a su grupo, consume sin
> filas y vuelve a comprar entrada. Nunca diseñar features que retengan usuarios frustrados.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript estricto, Turbopack) · React 19 |
| Estilos | Tailwind CSS 3.4 (`tailwind.config.ts`) + `tailwindcss-animate`, componentes estilo shadcn en `src/components/ui` |
| Íconos | `lucide-react` |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) — `supabase/schema.sql` |
| Media | `browser-image-compression` → WebP en cliente antes de subir (`src/lib/media/compress.ts`) |
| Tests | Vitest (`src/**/*.test.ts`) |

## Comandos

```bash
npm run dev        # servidor de desarrollo (http://localhost:3000)
npm run build      # build de producción (verifica tipos)
npm run typecheck  # tsc --noEmit
npm test           # tests del motor de reglas + contrato cliente ↔ schema.sql
npm run test:integration  # integración REAL contra un Supabase de prueba (ver más abajo)
node scripts/generate-icons.cjs        # re-rasteriza íconos PWA desde public/icons/icon.svg
node scripts/generate-demo-avatars.mjs # regenera avatares SVG del demo
node scripts/capture-landing-shots.cjs # re-captura las pantallas reales de la landing (app en demo corriendo)
```

## Estructura

```
src/
  app/                    # Rutas (App Router)
    layout.tsx            # Fuentes, metadata PWA, RougeProvider, AppShell
    page.tsx              # Landing pública a ancho completo (capturas reales en public/landing)
    app/                  # Home del asistente (hub del evento) — start_url de la PWA
    login/                # Login por tipo de usuario: Asistente / Equipo. Supabase: magic link, Google, Instagram; demo: persona/rol
      instagram/          # Vuelta del login con Instagram: canjea #token_hash por la sesión (verifyOtp)
    api/instagram/        # OAuth de Instagram (SOLO servidor): start, callback, media (listar/importar), DELETE, data-deletion
    onboarding/           # Alta del perfil persistente en 4 pasos (guarda progresivamente)
    profile/              # "Así te ven" + completitud · profile/edit (editor completo)
    settings/privacy/     # Lista negra por teléfono + perfiles bloqueados
    u/[username]/         # Perfil de otro asistente (afinidad, Conectar, Rompehielos, bloquear)
    join/                 # Ingreso manual por código · join/[code]: link maestro, código único o link de Squad + Mood
    lobby/                # Grilla por afinidad, Ghost Mode, filtros, Line-up, cambio de Mood
    inbox/                # Rompehielos fijados arriba, solicitudes, enviadas y matches (de todos los eventos)
    chat/[connectionId]/  # Chat 1:1 entre matches, texto + fotos (persiste tras el cierre del lobby)
    map/                  # Plano: Pin-Drop 15 min con audiencia manual, Punto Base (?mode=base), rescate (?rescue=1), ?focus=<userId>
    squad/                # Crear/unirse, invitar (link, @username), Rescate / Llegué a casa, Punto Base, Mesa VIP, perk grupal
    squad/chat/           # Chat grupal (texto + fotos + alertas del sistema)
    perks/                # Billetera de QRs (perks, pedidos) + avisos del organizador (Text Blasts)
    bar/                  # Barra Express: delivery a pin/Mesa VIP, Fast-Pickup QR, Vaquita de Squad
    admin/                # Suite del organizador (vista EXPANDIDA en desktop, pestañas en mobile)
      page.tsx            # Resumen: ROI (ventas por app, ticket promedio, filas evitadas), embudo, top consumo
      events/             # Crear/editar evento, lobby (horas antes/después), plano subido, line-up, link maestro + QR, códigos 1 uso + CSV
      crm/                # Tabla completa: búsqueda, Smart Tags, orden, WhatsApp, export CSV
      blasts/             # Text Blast / Flash Promo segmentado con alcance en vivo y vista previa
      perks/              # Reglas de QR Drop, ruleta de sorteo en vivo, validación de QR
      bar-pos/            # Kanban de comandas (minimapa de entrega) + entrega por código de retiro
      live-wall/          # Pantalla gigante LED a pantalla completa (sin chrome)
      print-codes/        # Hoja imprimible: un QR por código de 1 uso libre (?event=<id>)
    offline/              # Fallback del Service Worker
  components/
    ui/                   # Primitivas: Button, Badge, Switch, BottomSheet, Avatar, Toaster, field (TextField, Segmented)
    media/                # MediaImage (placeholder color), LoopVideo (GIF-like), SpotifyEmbed (lazy)
    profile/              # ProfileView, PhotoSlots, LoopVideoField, GenrePicker, SpotifyField, PhoneField, BlacklistManager
    layout/               # AppShell, BottomNav (5 tabs), PageHeader, PersonaSwitcher, LiveNotifications, SW register
    lobby/                # GridCard, ConnectActions, IcebreakerComposer, MatchCelebration, useConnect
    chat/                 # MessageList (texto, fotos, system_alert), Composer (foto comprimida)
    squad/                # InviteToSquadButton ("Invitar a mi Squad" desde cualquier perfil)
    perks/                # QrBlock (QR alto contraste)
    share/ShareSheet.tsx  # QR + compartir nativo + WhatsApp + copiar + PNG para CUALQUIER link (useShare, ShareButton)
    social/               # SocialLoginButtons, InstagramPhotoPicker, InstagramField (+ useInstagramReturn), InstagramCallback
    landing/Landing.tsx   # Secciones de la landing
    admin/                # AdminChrome (nav por permisos, NoAccess, badge de rol), TeamPanel, SecurityPanel, PrintCodes, AdminHeader, Panel, downloadCSV
    venue/VenueMap.tsx    # Plano interactivo (zoom/paneo, sectores, pines)
    event/                # LineupBanner, MoodPicker
  lib/
    types.ts              # Tipos de dominio — ESPEJO 1:1 de supabase/schema.sql
    engine/
      roles.ts            # Tipos de usuario, permisos por rol, roleHome(), destinationFor() (espejo de has_staff_role)
      selectors.ts        # Reglas de VISIBILIDAD (bloqueos, ghost, pines, lobby)
      actions.ts          # Reglas de NEGOCIO puras (state, input, now) → Result
      affinity.ts         # Algoritmo de afinidad
      grid.ts             # lobbyGrid(): visibles + afinidad + estado de conexión + filtros
      bar.ts              # Metadatos de presentación de Barra Express (labels, QR de retiro)
      profile.ts          # Validaciones de perfil, parser de Spotify, máscara de teléfono, completitud
      analytics.ts        # Métricas B2B, CRM, Smart Tags, liveWallData()
      engine.test.ts      # Tests de invariantes de negocio
    mock/seed.ts          # Motor de Mock Data (fechas relativas a "ahora")
    store/RougeContext.tsx# Estado global: Modo Demo (localStorage) o Supabase (sesión + carga + Realtime); exec()
    store/commands.ts     # Comandos: regla local del motor + contraparte remota (RPC/tabla) de CADA acción
    store/commands.test.ts# Contrato cliente ↔ schema.sql (RPCs, parámetros, tablas, columnas, cargador)
    store/supabase.integration.test.ts # Flujo completo con usuarios reales, RLS, Realtime y Storage (se saltea sin credenciales)
    store/hooks.ts        # useRequireProfile() → /login (Supabase sin sesión) o /onboarding (sin perfil)
    supabase/sync.ts      # fetchRemoteState() (RLS) + subscribeRealtime()
    supabase/errors.ts    # friendlyError(): excepciones de RPC/RLS → mensajes en español
    supabase/client.ts    # Cliente Supabase (null si no hay credenciales)
    social/client.ts      # Google (signInWithOAuth), Instagram (start/importar/desconectar), flags SOCIAL, IG_ERRORS
    instagram/oauth.ts    # Helpers puros del OAuth (state firmado, signed_request, parseo Graph) — testeados
    instagram/server.ts   # Tokens, Graph API, sesión por magic link (service role). Solo servidor
    media/compress.ts     # Compresión WebP, color dominante, transcodificación del loop (sin audio)
    media/mediaStore.ts   # Blobs en IndexedDB (`idb:<uuid>`) para el Modo Demo
    media/upload.ts       # uploadMedia(): Supabase Storage si hay sesión, si no IndexedDB
supabase/schema.sql       # Tablas, índices, RLS, RPCs, triggers, realtime, storage
supabase/seed.sql         # Opcional: evento de prueba, menú y regla de QR (fechas relativas a now())
public/                   # manifest.json, sw.js, íconos, avatares demo, landing/ (capturas WebP)
```

## Principios de arquitectura

1. **Motor puro primero.** Toda regla de negocio vive en `src/lib/engine/*` como funciones
   puras `(state, input, now) → { ok, state, data } | { ok: false, error }`. La UI nunca
   implementa reglas ni llama al motor directo: usa `await exec(C.accion(...))` del `RougeContext`
   (`import * as C from "@/lib/store/commands"`).
1b. **Comandos.** Cada acción nueva se agrega en `commands.ts` con `local` (el motor) y `remote`
   (RPC/tabla). `exec` aplica `local` al instante (optimista, mismos mensajes de error) y, en
   Supabase, llama a `remote`; si el servidor rechaza, recarga el estado real y muestra
   `friendlyError`. Si el servidor genera datos (ids, códigos de retiro, ganador del sorteo, alcance),
   `remote` los devuelve y la UI usa `r.data` (nunca el dato local). Inserts directos usan el mismo
   id que el optimista (ej. mensajes) para no duplicar. Todo comando nuevo se agrega a
   `commands.test.ts` (verifica nombres de RPC, parámetros y columnas contra `schema.sql`).
   **`optimistic: false`** para acciones cuyo resultado lo genera el servidor (crear Squad → código de
   invitación, pedido → código de retiro, códigos de 1 uso, sorteo, ingreso): en Supabase el estado
   solo cambia con la respuesta real, así nunca se muestra/comparte un código inventado en el cliente.
   Tras cada confirmación, `exec` recarga el estado real ANTES de resolver (ids/códigos del servidor).
2. **Misma semántica en demo y en Supabase.** Cada acción del motor tiene su contraparte
   RLS/RPC en `schema.sql` (`join_event`, `send_connection`, `send_icebreaker`,
   `trigger_rescue`, `send_blast`, `draw_raffle`, `create_bar_order`, `event_crm`…).
   Si cambiás una regla, cambiala en **ambos** lados y en los tests.
3b. **Modo Supabase.** Sesión con magic link (`/login`); `current_user_id = auth.uid()`. El estado se
   arma con `fetchRemoteState` (selects con RLS; el teléfono solo vía `my_profile()` y, para staff,
   `event_crm()`), se re-sincroniza por Realtime (debounce), al enfocar la ventana y cada 45 s.
   Rutas públicas sin sesión: `/` (landing), `/login`, `/join/*`, `/offline`; el resto pasa por el login (AppShell).
   Sin evento activo se muestra la pantalla "No hay ninguna fiesta activa" (o "Crear evento" en admin).
   Botones "Simular…" solo existen en Modo Demo.
   `/join/<código>`: los códigos de 1 uso y los squads ajenos NO son legibles por RLS → la vista previa
   se pide a la RPC `resolve_access_code` (también para anónimos) y `C.joinEvent(..., serverEventId)`
   delega la validación al servidor cuando el cliente no puede ver el código.
   El staff NO ve las conexiones (quién hizo match con quién es privado): sus métricas vienen de la
   RPC `event_stats` (conteos agregados) en `state.admin_stats`, que `analytics.ts` usa si existe.
   El staff sí ve la composición de los squads de su evento (sorteos, CRM, Squad Leader).
3. **Modo Demo automático.** Sin `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` en `.env.local`,
   la app usa el estado local sembrado por `createSeedState(now)` y persistido en
   `localStorage` (`rouge:state`). Dos pestañas se sincronizan por el evento `storage`
   (simula Realtime). El `PersonaSwitcher` permite "actuar como" cualquier asistente.
   Si cambiás el formato del estado, subí `STATE_VERSION` en `seed.ts` (fuerza re-siembra).
4. **Hidratación solo en cliente.** La semilla depende de `Date.now()`; el provider muestra
   un BootScreen hasta montar. Las páginas de usuario son Client Components.
5. **Una sola interfaz.** `AppShell` renderiza todo dentro de
   `max-w-md mx-auto min-h-screen border-x border-white/10 shadow-2xl relative` salvo
   `/admin/*` (vista expandida). Overlays (`BottomSheet`, `Toaster`) son `fixed` + `max-w-md mx-auto`.
6. **Baja señal.** Comprimir toda imagen con `compressImage()` antes de subir; avatares con
   fallback de iniciales y color dominante (`blur_color`); Service Worker cache-first para estáticos;
   el iframe de Spotify NO se carga hasta que el usuario toca "Escuchar".
7. **Media fuera del localStorage.** Fotos y videos nunca se guardan como data URL en el estado:
   `uploadMedia()` devuelve una URL de Storage o una ref `idb:` que se resuelve con
   `useMediaUrl()` (ya integrado en `Avatar`, `MediaImage`, `LoopVideo`). Toda imagen de perfil
   se renderiza con esos componentes.
9. **Notificaciones en vivo.** `LiveNotifications` deriva novedades del estado (blasts, rescates,
   pedidos listos, QRs, invitaciones, solicitudes, matches) y muestra solo las no vistas por persona.
   Con Supabase, las filas llegan por Realtime y el componente no cambia. Máximo 2 banners a la vista:
   **nunca** tapar acciones críticas (el rescate se confirma en línea, no con banner persistente).
10. **Persona por pestaña (demo).** La persona activa se guarda en `sessionStorage`: cada pestaña
    simula un teléfono distinto aunque compartan el estado.
11. **Admin.** Las páginas `page.tsx` solo exportan el componente por defecto (Next lo exige): helpers
    a `components/admin` o `lib`. Los avisos en `/admin` van arriba a la derecha. La Pantalla LED se
    dimensiona con `min(vw, vh)` para entrar en cualquier proyector (probado 1920×1080, 1280×720, 1024×768).
13. **Extensiones en Supabase:** viven en el schema `extensions`. Toda función `security definer` usa
    `set search_path = public, extensions` (si no, `gen_random_bytes` falla en producción aunque en
    PGlite funcione).
14. **Integración real:** `npm run test:integration` con `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` y
    `SUPABASE_TEST_SERVICE_KEY` (Supabase local o de staging con `schema.sql` + `seed.sql`). Crea
    usuarios únicos por corrida y prueba RLS, privacidad del teléfono, códigos ocultos por RLS,
    Realtime y Storage. Correrlo antes de cada cambio de `schema.sql` o `commands.ts`.
12. **RPCs que devuelven filas:** llamar `select * from fn(...)`, nunca `select (fn(...)).*` (Postgres
    re-ejecuta la función una vez por columna). `supabase.rpc()` ya lo hace bien.
15. **Roles.** Tipos de usuario: asistente, `owner` (quien crea el evento, aunque no tenga fila), `manager`,
    `bartender`, `waiter`, `security` (`event_staff`). Permisos en `ROLE_PERMISSIONS` (`roles.ts`) ⇔
    `has_staff_role` / `is_event_manager` / `can_operate_bar` en SQL. Los comandos de staff usan `guarded(perm, …)`
    (mismo mensaje `NO_PERMISSION`); la UI usa `useRouge().can(perm)` / `role`. `AdminChrome` filtra el menú y muestra
    `NoAccess` si el rol no tiene la sección (`ADMIN_ROUTE_PERMISSION`). Tras el login cada uno va a `destinationFor()`
    (barra/mozo → comandas, seguridad/dueño/producción → resumen, asistente → `/app`). El equipo lo arma solo el dueño/a
    (`setStaffRole` / RPC `set_staff_role`, por @username). Botones demo que actúan por el staff pasan `{ simulate: true }`.
16. **Todo link se comparte con QR.** Usar `useShare()` / `ShareButton` (`components/share`) para cualquier link
    nuevo (evento, códigos, Squad, perfil). Links relativos se completan con el dominio actual.
17. **Login social.** Google = proveedor nativo de Supabase (`signInWithOAuth`, vuelve a `/login`). Instagram = OAuth
    propio en `/api/instagram/*` (Supabase no lo trae): `start` firma un `state` HMAC atado a una cookie httpOnly;
    `callback` canjea code → token largo (60 días), guarda en `instagram_accounts` (RLS sin políticas: ningún cliente lee
    tokens) y, en login, abre la sesión con `generateLink` + `verifyOtp` (`/login/instagram`, token en el fragmento).
    Cuentas nuevas usan un email interno `ig-<id>@instagram.rouge.invalid` (no entregable). Las fotos importadas se
    descargan por `/api/instagram/media` (solo hosts de Meta) y pasan por `compressImage → uploadMedia`.
    `RougeContext` publica `signedIn` recién cuando cargó el estado de ESE usuario (evita decidir "sin perfil" antes de tiempo).
    Botones visibles con `NEXT_PUBLIC_AUTH_GOOGLE=1` / `NEXT_PUBLIC_AUTH_INSTAGRAM=1`; en demo se simulan.
8. **Guardado sincrónico.** `run()` persiste en el acto (y hay flush en `pagehide`): una acción
   nunca se pierde por cerrar la PWA o navegar inmediatamente.

## Reglas de negocio (no negociables)

- **Invisibilidad mutua por bloqueo:** si A bloqueó a B (por id **o** por teléfono normalizado
  E.164 vía `normalizePhone`), ninguno ve al otro en grilla, búsquedas, squads, plano ni chat.
  Usar siempre `isBlockedBetween()` / `public.is_blocked()`. Los errores no revelan el bloqueo
  (mensaje genérico "Este perfil no está disponible").
- **Perfil:** +18 (`checkBirthDate`), `@username` único `[a-z0-9._]{3,20}`, máx 4 fotos, bio ≤160,
  ≤5 géneros, teléfono único normalizado E.164, Spotify guardado como URL de embed limpia
  (`parseSpotify`). Loop ≤5 s, re-codificado sin audio vía canvas + MediaRecorder.
- **Lista negra:** nunca revelar si un teléfono bloqueado tiene cuenta; mostrar números enmascarados
  (`maskPhone`). Un perfil bloqueado o inexistente muestra el mismo estado "no disponible".
- **Instagram:** `instagram_username` se puede escribir a mano (`parseInstagram`); `instagram_verified` lo calcula el
  trigger `profile_instagram` (⇔ coincide con la cuenta conectada) y el motor (`instagramVerified`): el cliente nunca
  lo escribe. Una cuenta de Instagram se conecta a un solo perfil. Desconectar borra el token y saca el @.
  Solo cuentas profesionales (Creador/Empresa) pueden conectarse por API desde 2024.
- **Teléfono privado:** nunca se expone a otros usuarios (column privileges en `profiles`);
  solo el CRM del staff (`event_crm`) lo ve.
- **Ghost Mode ("Modo Solo Amigos"):** oculta al usuario de la grilla de conexiones; sigue visible
  para su Squad y matches. Mientras está activo **no puede enviar** Conectar ni Rompehielos (sí aceptar
  solicitudes que ya tenía). Plano, barra, perks y sorteos siguen funcionando.
- **Grilla:** `lobbyGrid()` excluye bloqueados, ghost, a uno mismo y conexiones rechazadas; ordena por
  rank de afinidad. Filtros: géneros, moods y "Coincidieron en tu zona" (`visited_sectors` en común:
  sectores donde cada uno dejó pin, sin guardar coordenadas).
- **Conexión:** like normal → pendiente; like recíproco → match inmediato.
- **Rompehielos:** **1 por evento** (`icebreaker_used`), máx 140 caracteres, fijado arriba en la
  bandeja. Respeta `only_liked_can_icebreak`. Al aceptar, su texto es el primer mensaje del chat.
  Opcional: trago QR prepago adjunto (`gifted_drink`), solo categorías individuales
  (`GIFTABLE_CATEGORIES`: trago, cerveza, sin alcohol). Usar `icebreakerEligibility()` para
  deshabilitar el botón y explicar el motivo ANTES de que el usuario escriba.
- **Ingreso:** `resolveAccessCode()` acepta slug, código maestro, código único de 1 uso o código de
  Squad (que además suma al Squad). Sin perfil → `/onboarding?next=/join/<code>`.
- **Efecto Cenicienta:** el lobby abre `lobby_opens_at` y cierra `lobby_expires_at`. Cerrado ⇒
  sin grilla, plano, squads ni conexiones nuevas; **matches y chats 1:1 quedan para siempre**.
- **Pines:** 1 activo por usuario, expiran a los **15 min**. Audiencia elegida manualmente:
  Squad (cian) y/o matches seleccionados (rouge). **Nunca** se comparte con matches no seleccionados.
- **Rescate 🚨:** 1 toque. Usa el pin activo, si no el Punto Base; se puede precisar tocando el plano
  (`/map?rescue=1`). Clava pin rojo compartido con el Squad + `safety_status = rescue_needed` +
  alerta `system_alert` en el chat del Squad. **🏠 Llegué a casa:** borra pines y avisa.
- **QR Drops:** reglas `perk_rules` (ej. Squad de 4 antes de la 01:00) otorgan 1 QR por integrante,
  idempotente (`source_ref_id`).
- **Barra Express:** precios siempre del menú del servidor; la Vaquita reparte `total_spent`
  entre miembros del Squad. Delivery exige pin activo o Mesa VIP con Punto Base. Flujos de estado en
  `ORDER_FLOW` (pickup: pending→preparing→ready_qr→completed; delivery: …→delivering→completed).
- **Eventos (admin):** `upsertEvent` valida lo mismo que `events_time_chk` (apertura ≤ inicio < fin ≤
  cierre), cupo > 0, slug ≥ 3 único y sets del line-up con artista y horario válido.
- **Comandas:** el Kanban avanza solo por `ORDER_FLOW` (`advance_bar_order` en SQL). La ventanilla
  rápida entrega con `redeemPickupCode` / `redeem_pickup_code`: solo si el pedido está `ready_qr`;
  acepta el código corto o el QR completo `ROUGE:ORDER:<id>:<código>`.
- **Sorteos:** la ruleta es visual; el ganador real lo define `drawRaffle` sobre `raffleEligible`
  (en SQL `draw_raffle` con `random()`), y recibe un QR `raffle_prize`.
- **Roles:** dueño/a y producción operan todo (eventos, accesos, CRM, blasts, perks, sorteos, menú); solo dueño/a
  suma/quita equipo y quien creó el evento no se puede quitar. Barra: comandas + ventanilla (canjea pickup y QRs de
  perk) + LED. Mozo/a: comandas. Seguridad: resumen con alertas de rescate (`eventRescueAlerts`) y LED, sin ventas ni
  teléfonos. `event_stats` solo dueño/producción/seguridad; `event_crm` y códigos solo dueño/producción.
- **Pin-Drop (SQL):** usar la RPC `drop_pin` (reemplaza el pin anterior y descarta ids que no son
  matches reales). Punto Base y su aviso: `set_squad_base_pin`, `announce_base_meetup`.

## Sistema de diseño — "Velvet & Laser" Dark UI

| Token | Hex | Uso |
|---|---|---|
| `background` | `#070709` | Obsidian Black — fondo base |
| `surface` | `#121216` | Charcoal Glass — `glass` = `bg-surface/85 backdrop-blur-xl border-white/10` |
| `rouge` | `#FF1E56` (hover `#E01145`) | Primario: matches, rompehielos, SOS — `shadow-glow-rouge` |
| `squad` | `#00F0FF` | Amigos, pines de Squad — `shadow-glow-squad` |
| `vip` | `#FFB800` | Monetización: barra, perks, sorteos, Mesa VIP, Punto Base |
| `text-primary` | `#F8FAFC` | Texto principal |
| `text-muted` | `#94A3B8` | Texto secundario |

- **Tipografía:** `font-display` = Space Grotesk (títulos, badges, métricas, contadores; 600/700,
  tracking tight) · `font-sans` = Plus Jakarta Sans (cuerpo, bios, chat; 400/500/600).
- **Plano:** Squad pulsa cian, Match pulsa rouge, Punto Base es bandera dorada.
- **Tarjetas de grilla:** `aspect-card` (3:4), imagen a sangre, `.card-fade`, badge de % afinidad,
  `.glass-pill` con el Mood.
- **Ergonomía:** botones ≥ 44px (`min-h-touch`), modales `BottomSheet`, una mano.
- No inventar colores nuevos: si hace falta un estado, usar opacidades de los tokens.
- Respetar `prefers-reduced-motion` (ya global en `globals.css`).

## Roadmap

- [x] **Fase 1** — Cimientos, identidad, esquema SQL, motor de reglas y Mock Data.
- [x] **Fase 2** — Onboarding/perfil (4 fotos comprimidas, loop 5s, géneros, Spotify), privacidad y bloqueos.
- [x] **Fase 3** — Ingreso `/join/[code]` + Mood, Line-up, grilla por afinidad, Ghost Mode, conexiones y Rompehielos.
- [x] **Fase 4** — Squads y seguridad, Pin-Drop 15 min, Punto Base, chat realtime (texto + fotos), Perks/QRs y Barra Express.
- [x] **Fase 5** — `/admin`: eventos y códigos, CRM + CSV, Text Blasts, perks y sorteos, Kanban de barra, Pantalla LED.
- [x] **Fase 6** — Roles de equipo (login por tipo de usuario, permisos en cliente y SQL), QR para todo link, landing pública.
- [x] **Fase 7** — Login con Google e Instagram, importar fotos del feed e Instagram (verificado) en el perfil.

## Convenciones

- Código y comentarios técnicos en español rioplatense neutro; identificadores en inglés.
- Campos en `snake_case` (igual que Postgres) en `types.ts`.
- Nada de `any`. Nuevas tablas ⇒ actualizar `types.ts`, `RougeState`, `seed.ts`, `schema.sql`.
- Antes de commitear: `npm run typecheck && npm test && npm run build`.
