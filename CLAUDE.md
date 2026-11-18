# Rouge Pass — Guía de arquitectura para Claude Code

> El producto se llama **Rouge Pass** (antes ROUGE). Lo interno conserva "rouge": el token de color `rouge`, los QR
> `ROUGE:ORDER:` / `ROUGE:PASS:`, las claves `rouge:*` de localStorage, `RougeContext`/`useRouge` y el email interno de
> Instagram. Los textos visibles usan `APP_NAME` (`src/lib/brand.ts`) y el wordmark `<Wordmark />` (`components/brand`).

Rouge Pass es una **PWA social y operativa para eventos, fiestas y discotecas (B2B2C)**. Con **ROUGE Pro** (misma marca y
mismo motor) también sirve para eventos corporativos, pymes y networking: cada evento es `nightlife` o `corporate`.
Los asistentes entran a un lobby privado del evento (link maestro o código de 1 uso),
conectan con gente afín, arman su **Squad** (seguridad grupal + perks), se ubican en el
**plano** con pines de 15 min y piden en la **Barra Express**. El organizador paga
(fee por evento / por asistente activo / comisión de barra-VIP) y opera todo desde `/admin`.

> **Tesis:** Rouge Pass gana cuando la gente conecta rápido, no pierde a su grupo, consume sin
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
npm run e2e:demo          # E2E Playwright contra la app en demo levantada (e2e/; también e2e:supabase, e2e:instagram, e2e:api)
node scripts/generate-icons.cjs        # re-rasteriza íconos PWA desde public/icons/icon.svg
node scripts/generate-demo-avatars.mjs # regenera avatares SVG del demo
node scripts/capture-landing-shots.cjs # capturas reales de la app en public/landing (material comercial; la landing 3D no las usa)
node scripts/generate-promo.cjs [app] [url demo] # piezas 1080×1350 para organizadores → marketing/organizadores
```

## Estructura

```
src/
  proxy.ts                # CSP con nonce por request (Next 16: "proxy" = ex middleware)
  app/                    # Rutas (App Router)
    layout.tsx            # Fuentes, metadata PWA, RougeProvider, AppShell
    page.tsx              # Landing PÚBLICA 3D (asistentes): solo sus beneficios. SIN demo, CRM, ventas ni planes
    organizadores/        # Landing para organizadores (CRM, ventas, barra, RRPP, puerta, planes). OCULTA: noindex y sin links desde "/"
    demo/                 # Demo para anfitriones (solo Modo Demo, noindex): hub, abrir?rol=&a=, presentador (iframes lado a lado)
    app/                  # Home del asistente (hub del evento) — start_url de la PWA
    login/                # Login por tipo de usuario: Asistente / Equipo. Supabase: magic link, Google, Instagram; demo: persona/rol
      instagram/          # Vuelta del login con Instagram: canjea #token_hash por la sesión (verifyOtp)
    api/instagram/        # OAuth de Instagram (SOLO servidor): start, callback, media (listar/importar), DELETE, data-deletion
    api/csp-report/       # Reportes de violaciones de la CSP (solo log)
    api/v1/               # API para ticketeras (SOLO servidor): events, events/[eventId]/codes(/[code]), qr/[code], openapi.json
    onboarding/           # Alta del perfil persistente en 4 pasos (guarda progresivamente)
    profile/              # "Así te ven" + completitud · profile/edit (editor completo) · profile/personas (Mis perfiles + editor ?id=|?kind=&next=)
    settings/privacy/     # Ajustes de privacidad (incógnito, pin solo Squad, datos pro tras reunión) + lista negra + bloqueados
    meetings/             # Mis reuniones: para responder, próximas, enviadas, historial (aceptar, reprogramar, cancelar)
    agenda/               # [v1.11] ROUGE Pro: agenda multi-track (filtros, Mi Agenda) · agenda/[sessionId]: charla + Q&A y encuestas en vivo
    pro/                  # ROUGE PRO: landing corporativa con identidad ejecutiva propia (pública, indexable). /empresas redirige acá
    api/leads/            # POST de leads B2B (SOLO servidor): valida, honeypot + límite por IP, b2b_leads y webhook comercial
    u/[username]/         # Perfil de otro asistente (afinidad, Conectar, Rompehielos, bloquear)
    join/                 # Ingreso manual por código · join/[code]: link maestro, código único o link de Squad + Mood
    lobby/                # Grilla por afinidad, Ghost Mode, filtros, Line-up, cambio de Mood
    inbox/                # Rompehielos fijados arriba, solicitudes, enviadas y matches (de todos los eventos)
    chat/[connectionId]/  # Chat 1:1 entre matches, texto + fotos (persiste tras el cierre del lobby)
    map/                  # Plano: Pin-Drop 15 min con audiencia manual, Punto Base (?mode=base), rescate (?rescue=1), ?focus=<userId>, ?spot=<salaId> (centra la sala)
    squad/                # Crear/unirse, invitar (link, @username), Rescate / Llegué a casa, Punto Base, Mesa VIP, perk grupal
    squad/chat/           # Chat grupal (texto + fotos + alertas del sistema)
    squad/cuentas/        # Cuentas de la mesa: quién pagó qué, saldos, transferencias mínimas, alias, "Ya le pagué"
    perks/                # Billetera de QRs (perks, pedidos) + avisos del organizador (Text Blasts)
    bar/                  # Barra Express: delivery a pin/Mesa VIP, Fast-Pickup QR, compartido con el Squad, pago con Mercado Pago
    api/mercadopago/      # Cobros (SOLO servidor): connect (OAuth/desconectar), callback, checkout, orders/[id] (conciliar), webhook
    admin/                # Suite del organizador (vista EXPANDIDA en desktop, pestañas en mobile)
      page.tsx            # Resumen: ROI (ventas por app, ticket promedio, filas evitadas), embudo, top consumo
      brand/              # Marca y cobros: logo + colores con vista previa, personalización del evento, conectar Mercado Pago
      menu/               # Menú de la barra: alta, edición, precio, "Agotado", baja
      agenda/             # [v1.11] Agenda & Charlas (solo corporativo): alta/edición de charlas, En Vivo y moderación
      events/             # Crear/editar evento, lobby (horas antes/después), plano subido, line-up, link maestro + QR, códigos 1 uso + CSV
      crm/                # Tabla completa: búsqueda, Smart Tags, orden, WhatsApp, export CSV
      blasts/             # Text Blast / Flash Promo segmentado con alcance en vivo y vista previa
      perks/              # Reglas de QR Drop, ruleta de sorteo en vivo, validación de QR
      bar-pos/            # Kanban de comandas (minimapa de entrega) + entrega por código de retiro
      live-wall/          # Pantalla gigante LED a pantalla completa (sin chrome)
      print-codes/        # Hoja imprimible: un QR por código de 1 uso libre (?event=<id>)
      print-ticket/       # Ticket térmico 80 mm de una comanda (?order=<id>&copia=cliente|barra), se imprime solo
      rrpp/               # RRPP: link + QR propios y números (RRPP) · ranking, comisión y liquidación CSV (dueño/producción)
      door/               # Puerta: escáner con cámara (entradas y pase de la app) con foto, nombre y edad
    offline/              # Fallback del Service Worker
  components/
    ui/                   # Primitivas: Button, Badge, Switch, BottomSheet, Avatar, Toaster, field (TextField, Segmented)
    media/                # MediaImage (placeholder color), LoopVideo (GIF-like), SpotifyEmbed (lazy)
    profile/              # ProfileView, PhotoSlots, LoopVideoField, GenrePicker, SpotifyField, PhoneField, BlacklistManager, ProFacts (busca/ofrece)
    layout/               # AppShell, BottomNav (5 tabs), PageHeader, PersonaSwitcher, LiveNotifications, SW register
    lobby/                # GridCard, ConnectActions, IcebreakerComposer, MatchCelebration, useConnect
    chat/                 # MessageList (texto, fotos, system_alert), Composer (foto comprimida)
    squad/                # InviteToSquadButton ("Invitar a mi Squad" desde cualquier perfil)
    meetings/             # MeetingRequestSheet (pedir / reprogramar), LocationPicker (sala, pin o a definir), MeetingButton
    pro/                  # ROUGE PRO (/pro): ProLanding, ProNavbar + ModeSwitch (Nightlife ⇄ PRO), ProHero (mock 3D con GSAP),
                          # ProBentoGrid (ProAudienceSplit, ProOrganizerGrid, ProAttendeeGrid), ProSpotlights (Networking, Acceso, Privacidad),
                          # ProUseCases, ProTelemetry (simulador), ProDemoForm (+ modal), ProFooter, content.ts (textos; "Próximamente" = soon)
                          # [v1.10] Piezas ejecutivas de la APP en eventos corporativos: ExecutiveProfileCard (+ TierBadge),
                          # CorporateProfileFields (borrador de la ficha), CorporateProfileSheet (panel rápido), CorporatePassView
                          # (QR de acceso ⇄ vCard, .vcf, "Tus accesos"), fonts.ts (Inter + JetBrains Mono compartidas)
                          # [v1.11] Agenda: OrganizerScheduleManager (panel), CorporateScheduleView (grilla + Mi Agenda),
                          # SessionDetail, SessionLiveInteraction (Q&A + encuestas, vista de moderación), AgendaHomeCard,
                          # scheduleUi.tsx (TrackBadge, LiveBadge, ProButton, useAgendaToggle con aviso de choque)
    perks/                # QrBlock (QR alto contraste)
    share/ShareSheet.tsx  # QR + compartir nativo + WhatsApp + copiar + PNG para CUALQUIER link (useShare, ShareButton)
    social/               # SocialLoginButtons, InstagramPhotoPicker, InstagramField (+ useInstagramReturn), InstagramCallback
    demo/                 # DemoHub (guion + vistas por rol), DemoOpen, Presenter (teléfono + panel sincronizados)
    brand/BrandTheme.tsx  # useBrandTheme() (variables CSS del tema en <html>) y BrandLogo
    landing/              # Landing 3D: Landing.tsx (composición por audiencia "public" | "organizers"), core/ (Lenis+ScrollTrigger, scrollStore, entry, audience),
                          # fx/ (Cursor, Magnetic, SplitReveal, TiltCard), three/ (Scene R3F + choreography), sections/ (8 secciones)
    scan/QrScanner.tsx    # Cámara → QR (BarcodeDetector nativo o jsQR); lo usan Puerta y la ventanilla de la barra
    admin/                # AdminChrome (nav por permisos, NoAccess, badge de rol), BrandStudio, MenuEditor, PrintTicket, EventLifecyclePanel, RrppPanel, DoorScanner (zona de control obligatoria + registro), ZonesPanel, TeamPanel, SecurityPanel, ApiKeysPanel, PrintCodes, AdminHeader, Panel, downloadCSV
    venue/VenueMap.tsx    # Plano interactivo (zoom/paneo, sectores, pines)
    event/                # LineupBanner, MoodPicker
  lib/
    types.ts              # Tipos de dominio — ESPEJO 1:1 de supabase/schema.sql
    engine/
      roles.ts            # Tipos de usuario, permisos por rol, roleHome(), destinationFor() (espejo de has_staff_role)
      verticals.ts        # Noche ⇄ corporativo (ROUGE Pro): moods, features, vocabulario, faceOf(), afinidad de negocio, perfiles
      privacy.ts          # Privacidad por contexto: profileAccess (⇔ profile_access), publicCard, ajustes, ageOf, profileHref
      meetings.ts         # Reuniones y salas: request/respond/reschedule/cancel, checkSlot, spotBusy, hasConflict, meetingSlots
      schedule.ts         # [v1.11] Agenda: charlas (⇔ session_check), Mi Agenda con choques, Q&A, moderación y encuestas (⇔ RPCs)
      selectors.ts        # Reglas de VISIBILIDAD (bloqueos, ghost, pines, lobby)
      actions.ts          # Reglas de NEGOCIO puras (state, input, now) → Result
      affinity.ts         # Algoritmo de afinidad
      grid.ts             # lobbyGrid(): visibles + afinidad + estado de conexión + filtros
      bar.ts              # Metadatos de presentación de Barra Express (labels, QR de retiro)
      branding.ts         # Marca: contraste WCAG (checkBrandColor ⇔ brand_color_error), resolveTheme, themeVars, upsertBrand
      payments.ts         # Cobro de pedidos: awaiting_payment → paid (confirmOrderPayment ⇔ confirm_order_payment), comisión
      settle.ts           # Cuentas de la mesa: ledger, saldos en centavos, transferencias mínimas, alias
      eventAdmin.ts       # Gestión del evento: menú, duplicar edición, expulsar/bloquear, eliminar (⇔ remove_attendee, events_delete)
      promoters.ts        # RRPP: link propio, comisión, promoterStats (⇔ ensure_promoter_link, promoter_stats)
      door.ts             # Puerta y zonas: parseDoorValue, zoneCheckIn (⇔ zone_check_in), doorCheckIn, scannerZones, upsertZone, pase ROUGE:PASS
      profile.ts          # Validaciones de perfil, parser de Spotify, máscara de teléfono, completitud
      analytics.ts        # Métricas B2B, CRM, Smart Tags, liveWallData(), curvas de 15' (eventCurve/liveComparison)
      security.ts         # Staff por organización, invitaciones, kill switch, kiosco PIN, auditoría, reportes, borrado
      qr.ts · scan.ts     # QR dinámicos TOTP y canje dinámico en barra
      doorOffline.ts      # Padrón de puerta sin conexión, búsqueda manual y reconciliación
      campaigns.ts        # Campañas por WhatsApp (segmentos, plantillas, bandeja wa.me)
      superadmin.ts       # Consola global (tablero, asistentes, staff)
      monetization.ts     # Trago desde el chat, Mesa VIP dividida, cola virtual, Wrapped
      engine.test.ts      # Tests de invariantes de negocio
    demo/script.ts        # Guion de la demo (7 pasos), roles demo y openAs(rol, ruta)
    security/             # headers.ts (CSP + headers), paths.ts (redirecciones/links seguros), rateLimit.ts, api.ts
    mock/seed.ts          # Motor de Mock Data (fechas relativas a "ahora")
    store/RougeContext.tsx# Estado global: Modo Demo (localStorage) o Supabase (sesión + carga + Realtime); exec()
    store/commands.ts     # Comandos: regla local del motor + contraparte remota (RPC/tabla) de CADA acción
    store/commands.test.ts# Contrato cliente ↔ schema.sql (RPCs, parámetros, tablas, columnas, cargador)
    store/supabase.integration.test.ts # Flujo completo con usuarios reales, RLS, Realtime y Storage (se saltea sin credenciales)
    store/schema.security.test.ts      # schema.sql real en PGlite + ~50 ataques a RLS/RPCs (corre en npm test)
    store/hooks.ts        # useRequireProfile() → /login (Supabase sin sesión) o /onboarding (sin perfil)
    supabase/sync.ts      # fetchRemoteState() (RLS) + subscribeRealtime()
    supabase/errors.ts    # friendlyError(): excepciones de RPC/RLS → mensajes en español
    supabase/client.ts    # Cliente Supabase (null si no hay credenciales)
    social/client.ts      # Google (signInWithOAuth), Instagram (start/importar/desconectar), flags SOCIAL, IG_ERRORS
    instagram/oauth.ts    # Helpers puros del OAuth (state firmado, signed_request, parseo Graph) — testeados
    instagram/server.ts   # Tokens, Graph API, sesión por magic link (service role). Solo servidor
    api/v1.ts             # API v1: auth por clave (SHA-256), validación, serialización, RPCs api_* (service role) — testeado
    api/openapi.ts        # Especificación OpenAPI 3.1 (mantener en sync con v1.ts)
    payments/mp.ts        # Mercado Pago puro: state firmado, AES-256-GCM, firma x-signature, preferencia, validación — testeado
    payments/server.ts    # OAuth, tokens del vendedor (refresh), checkout, webhook, conciliación (service role). Solo servidor
    payments/client.ts    # Navegador: conectar/desconectar, pagar, conciliar (flag NEXT_PUBLIC_PAYMENTS_MP)
    media/compress.ts     # Compresión WebP, color dominante, transcodificación del loop (sin audio)
    media/mediaStore.ts   # Blobs en IndexedDB (`idb:<uuid>`) para el Modo Demo
    media/upload.ts       # uploadMedia(): Supabase Storage si hay sesión, si no IndexedDB
    vcard.ts              # vCard 3.0 pura (buildVCard, personaVCard, escapes, plegado) + downloadVCard (descarga o compartir) — testeado
    leads.ts              # Leads B2B (validateLead ⇔ checks de b2b_leads), aviso comercial, planes y recomendación — testeado
.claude/skills/           # Skills de Claude Code (auditorías, QA, diseño, seguridad); ver su README.md
docs/                     # Documentación: producto, técnica, operaciones y api/ (guía para ticketeras)
e2e/                      # E2E Playwright (demo, Supabase, Instagram con API imitada) + env.cjs + run.cjs
CHANGELOG.md              # Historial de versiones (SemVer); pendientes conocidos
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
   un BootScreen hasta montar. Las páginas de usuario son Client Components. **Excepción: la landing** (`/`,
   `/organizadores`) se renderiza en el servidor con un estado vacío (SEO). Textos SEO y FAQ en `landing/content.ts`
   (módulo plano: lo usa también el JSON-LD de `app/page.tsx`); `robots.ts`, `sitemap.ts` y `opengraph-image.tsx` en
   `src/app`; dominio e indexación en `SITE_URL` / `SITE_INDEXABLE` (`lib/brand.ts`).
5. **Una sola interfaz, responsiva.** En móvil (< md) `AppShell` muestra el contenedor tipo teléfono
   (`max-w-md`) con `BottomNav`. En tablet/PC (≥ md) usa `DesktopSidebar` (riel en md, expandible en lg; estado en
   `localStorage`) y contenido fluido (`max-w-7xl` en rutas `WIDE`, `max-w-3xl` en lectura). El ancho del sidebar es
   la variable CSS `--sidebar-w` (en `<html data-sidebar>`): todo elemento `fixed` de la app usa `md:fixed-app-x`.
   `BottomSheet` pasa a diálogo centrado en md+; para paneles laterales sin navegar usar `Drawer`. Comportamiento
   distinto por tamaño (no solo estilos) con `useIsDesktop()` (`lib/hooks/useMediaQuery`). `/admin/*`, `/ops/*` y
   `/superadmin` van expandidos sin sidebar de la app.
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
    simula un teléfono distinto aunque compartan el estado. `window.name` = `rouge-persona:<id>` la fija por marco
    (lo usan los iframes de `/demo/presentador`). `saveDemoState` nunca pisa una fiesta con otro `seeded_at`
    (salvo `force` al reiniciar o re-sembrar). La landing no lleva atajos de demo: van en `/demo` (`lib/demo/script.ts`).
    **Demo visible solo tras `/demo`:** personas/roles en el login, `PersonaSwitcher`, links de prueba, "Simular…" y badges
    "Modo Demo" se muestran con `useRouge().demoVisible` (flag `rouge:demo-access` que fija pasar por `/demo/*`,
    `lib/demo/access.ts`); sin él, el login es el normal. Los E2E demo llaman `unlockDemo(ctx)` (`e2e/env.cjs`).
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
    `bartender`, `waiter`, `security`, `promoter` (RRPP) (`event_staff`). El RRPP NO es staff para ver datos
    (`is_event_staff` lo excluye; en SQL se compara `role::text = 'promoter'` porque el valor se agregó con ALTER TYPE). Permisos en `ROLE_PERMISSIONS` (`roles.ts`) ⇔
    `has_staff_role` / `is_event_manager` / `can_operate_bar` en SQL. Los comandos de staff usan `guarded(perm, …)`
    (mismo mensaje `NO_PERMISSION`); la UI usa `useRouge().can(perm)` / `role`. `AdminChrome` filtra el menú y muestra
    `NoAccess` si el rol no tiene la sección (`ADMIN_ROUTE_PERMISSION`). Tras el login cada uno va a `destinationFor()`
    (barra/mozo → comandas, seguridad/dueño/producción → resumen, asistente → `/app`). El equipo lo arma solo el dueño/a
    (`setStaffRole` / RPC `set_staff_role`, por @username). Botones demo que actúan por el staff pasan `{ simulate: true }`.
15b. **Plataformas y staff (v1.7).** `surfaceForPath` / `canAccessPath` (`roles.ts`) aíslan `client_app`, `staff_ops`
    (`/ops`), `owner_admin` (`/admin`) y `super_admin` (`/superadmin`); Puerta/Barra en turno solo ven `/ops`. Staff por
    organización (= cuenta del dueño/a): `staff_assignments` + `staff_invites` (token de 1 uso, 2 h, solo su SHA-256) con
    `access_window`; `staffRoleOf(s, ev, user, now)` ⇔ `assigned_staff_role`/`has_staff_role` en SQL. Kill switch
    `revoke_staff_access`; kiosco con `terminal_pins` (bcrypt) + `kiosk_unlock`/`kiosk_audit`; `audit_log` append-only
    (trigger). Reglas puras en `engine/security.ts`; hash/HMAC sincrónicos en `lib/crypto/sha256.ts`. Rate limiting en
    `src/proxy.ts` (Next 16, ex middleware) y cabeceras en `next.config.ts`.
15c. **QR dinámicos (v1.7).** Pase/perk/voucher = `ROUGE:T1:…` (TOTP 20 s, `engine/qr.ts` ⇔ `verify_dynamic_qr`);
    se dibujan con `DynamicQr` (nunca `QrBlock` para credenciales de la app). Secreto del evento en `event_secrets`
    (sin RLS para clientes). Puerta: `door_scan` (terminal, listas free, atómico) y `door_reconcile` (offline,
    `engine/doorOffline.ts` + `lib/offline/doorVault.ts`). Barra: `redeem_dynamic_qr`.
15d. **Módulos por evento (v1.8).** `EventFeatureFlags` en `engine/features.ts` (presets, `resolveFeatures` con
    dependencias, `ROUTE_FEATURES`). Toda pantalla/acción nueva de un módulo: agregar su ruta a `ROUTE_FEATURES`, el
    guarda `featureOn(...)` en el motor y `event_feature(...)` en su RPC. Hook `useEventFeatures()` (`store/hooks`).
    Crear eventos y tocar módulos: `canManageModules` ⇔ `can_manage_modules` (ROUGE HQ o autogestión);
    `EventBuilderWizard` es el único creador (en `/superadmin` y, con autogestión, en `/admin/events`).
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
18. **API v1 (clientes empresariales).** Route handlers en `src/app/api/v1/*` que solo traducen HTTP ⇄ RPC: toda regla
    vive en SQL (`api_authorize`, `api_issue_codes`, `api_revoke_code`, `api_key_events`), ejecutables SOLO por
    `service_role` (cerradas para `public`, `anon` y `authenticated`). Las claves se crean con `create_api_key` (devuelve
    la clave UNA vez; se guarda su SHA-256) y el servidor las busca por hash. Respuestas `{ data }` / `{ error: { code,
    message } }`. Cambios de la API ⇒ actualizar `openapi.ts`, `docs/api/README.md`, `v1.test.ts` y `e2e/api.cjs`.
19. **Landing 3D.** Stack solo de la landing: `three` + `@react-three/fiber` + `drei`, `gsap` (+ `@gsap/react`,
   ScrollTrigger), `lenis` y `framer-motion`. La escena (`three/Scene.tsx`) se carga con `dynamic(..., { ssr: false })` y
   es 100% procedural (sin .glb ni HDR externos: reflejos con `Lightformer`). Cada sección declara `data-stage` (0 Hero ·
   1 Experiencia · 2 Plano/Barra · 3 B2B/Cierre) y la escena lee `scrollState` (mutable, sin renders) en `useFrame`.
   Importar gsap desde `landing/core/gsap.ts`. Todo efecto se limpia al desmontar (useGSAP revierte, Lenis se destruye,
   el ticker vuelve a su lagSmoothing): /app y /admin no cargan ni heredan nada de esto. Ojo con `cn()` (tailwind-merge)
   y clases `text-glow-*`: las confunde con colores de texto; en SplitReveal se concatenan sin `cn`.
20. **Marca y tema.** `rouge` y `vip` son variables CSS (`rgb(var(--c-rouge) / <alpha>)`); el tema del evento
   (`eventTheme`: evento → marca → Rouge Pass) lo aplica `AppShell` con `useBrandTheme` en la app del asistente y la LED
   (no en landing, demo, login ni panel); `/join` aplica el del link. **Rescate = token `sos` fijo**, Squad = cian: nunca
   usar `rouge` para seguridad. En SVG, los colores con variables van en `style`, no en atributos. Opacidades de Tailwind
   solo de su escala (5, 10, 15…): `/12` o `/8` no se generan.
21. **Cobros.** Ningún cliente acredita pagos: `confirm_order_payment` es solo `service_role` y el servidor la llama tras
   verificar el pago con la API de Mercado Pago (token de ESA marca, external_reference, monto, moneda). Tokens siempre
   cifrados (`MP_TOKEN_KEY`). Un pedido `awaiting_payment` no avanza (`not_paid`) ni suma gasto. En demo: `payOrderDemo`.
22. **Seguridad (no romper).** Helpers de permisos SQL en el schema `private` (no expuesto por la API): referenciarlos
    como `private.<helper>(…)` y nunca crear helpers con ids arbitrarios en `public`. Cada tabla nueva: RLS + `revoke` +
    `grant` solo de las columnas que el cliente escribe; lo sensible (estados, totales, dueños, pines) va por RPC. Toda
    política o RPC nueva suma su ataque en `src/lib/store/schema.security.test.ts`. La CSP está en
    `src/lib/security/headers.ts`: un origen externo nuevo se agrega ahí con su motivo (sin `*` ni CDNs). El root layout es
    dinámico por el nonce. Redirecciones con `safeNext`/`safeInternalPath` (`src/lib/security/paths.ts`); links que vienen de
    datos (blasts) con `isSafeCtaLink`. Rutas `/api/*` nuevas: `rateLimited()` + `readJsonBody()` (`src/lib/security/api.ts`).
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
- **Códigos de acceso:** 10 caracteres (`new_access_code` / `ACCESS_CODE_LENGTH`). `external_ref` único por evento
  (idempotencia de la API). Un código anulado (`revoked_at`) es inválido para entrar; uno usado no se anula.
  Claves de API: alcance por evento o todos los de quien la crea; pierden acceso si esa persona deja de ser dueño/a o producción.
- **Roles:** dueño/a y producción operan todo (eventos, accesos, CRM, blasts, perks, sorteos, menú); solo dueño/a
  suma/quita equipo y quien creó el evento no se puede quitar. Barra: comandas + ventanilla (canjea pickup y QRs de
  perk) + LED. Mozo/a: comandas. Seguridad: resumen con alertas de rescate (`eventRescueAlerts`) y LED, sin ventas ni
  teléfonos. `event_stats` solo dueño/producción/seguridad; `event_crm` y códigos solo dueño/producción.
- **Marca:** colores `#RRGGBB` que pasan `checkBrandColor` (primario: contraste ≥ 3 con fondo y con blanco; acento:
  ≥ 4,5 con fondo; nada parecido al cian del Squad). Un evento solo usa marcas de quien lo creó. `payments_enabled` lo
  escribe solo el servidor.
- **Cobro de la barra:** con Mercado Pago conectado el pedido nace `awaiting_payment` y la barra no lo ve hasta `paid`;
  sin conexión, `pay_at_bar`. El gasto (`total_spent`) se suma al acreditarse. Comisión = `marketplace_fee`.
- **Cuentas de la mesa:** entran pedidos con `split_user_ids` (no los que esperan pago), `squad_expenses` y
  `squad_settlements`; centavos enteros, transferencias mínimas (`settleTransfers`). Solo integrantes; alias visible
  solo si comparten Squad (`shares_squad`). Funcionan con el lobby cerrado.
- **Gestión del evento:** menú editable por dueño/producción (`is_available` = "Agotado": no se vende, ni en el motor ni
  en `create_bar_order`). Expulsar (`remove_attendee`) saca del lobby, del Squad del evento y del plano; con bloqueo
  (`event_bans`) `join_event` responde `banned`. No se expulsa al equipo. Eliminar un evento: solo quien lo creó y si no
  tiene asistentes ni cobros (trigger `events_keep_payments`). Ticket de comanda = comprobante interno, no factura.
- **RRPP:** 1 link por RRPP y evento (`/join/RP…`, código del servidor); atribución por primer contacto
  (`referred_by`). Ve solo conteos (`promoter_stats`). Comisión por ingreso; con escáner se liquida por ingreso en puerta.
- **Puerta:** `door_check_in` (dueño/a, producción, seguridad) valida códigos de 1 uso (`checked_in_at`, distinto de
  `is_used`) y pases `ROUGE:PASS:<evento>:<usuario>`; rechaza anulados, expulsados, otro evento y el link general.
- **Zonas de control (v1.10):** `event_zones` (puerta `entrance` = acredita; área `area` = valida `allowed_tiers`, vacío =
  todas). El escáner exige elegir la zona (sin zonas, una sola opción: la puerta principal virtual, `zone_id` null) y
  usa `zone_check_in` (⇔ `zoneCheckIn`); `door_check_in` es la puerta principal. Toda lectura va a `zone_check_ins`
  (solo por RPC; la ven dueño/a, producción y seguridad). Categoría (`tier`: attendee, speaker, vip, press, sponsor): la da
  el código de 1 uso al entrar o `set_attendee_tier` (organización); el asistente nunca la escribe. En corporativo el
  escáner muestra la cara profesional y nunca la edad ni la cara de la noche.
- **Ficha ejecutiva y vCard (v1.10):** en un evento corporativo, perfil propio, perfil ajeno y pase usan
  `ExecutiveProfileCard` / `CorporatePassView` (sin fotos de fiesta, loop, música, edad, Instagram, Squad ni Rescate).
  Email y teléfono de contacto de la ficha son campos propios de `profile_personas` (nunca el teléfono de la cuenta) y
  se ven según `privacy_level` (`personaContactVisible` ⇔ `persona_contact_visible`: strict por defecto). La vCard se arma
  en el cliente SOLO con la ficha ya saneada; en la propia, la persona elige si incluye email y teléfono. Sin ficha
  profesional, el ingreso a un evento corporativo abre `CorporateProfileSheet`.
- **Sitio:** la landing pública (`/`) nunca muestra CRM, ventas, planes ni links a `/organizadores` (noindex). Su header lleva
  el switch **Nightlife ⇄ PRO** (`ModeSwitch`) hacia `/pro`, la vertical corporativa (pública, indexable; `/empresas` redirige).
  Los leads de `/pro` entran solo por `/api/leads` (service role).
- **ROUGE PRO (`/pro`) — no negociable:** (1) identidad ejecutiva propia: solo colores `pro-*` y fuentes `font-pro` /
  `font-pro-mono` (Inter + JetBrains Mono, de `components/pro/fonts.ts`); nunca `rouge`/`squad`/`vip` ni el tema del evento.
  (2) Las ventajas **para quien organiza** y **para quien asiste** van SIEMPRE en bloques separados y rotulados
  (`AudienceTag`; `PRO_ORGANIZER_MODULES` vs `PRO_ATTENDEE_BENEFITS` en `components/pro/content.ts`), igual que en la noche
  `/` (asistentes) y `/organizadores` (organizadores). (3) Solo se promete lo que existe: lo demás lleva `soon: true`
  ("Próximamente"). Los números de mocks y simulador dicen "datos de ejemplo".
- **Verticales (ROUGE / ROUGE Pro):** `events.kind` = `nightlife` | `corporate`; todo lo que cambia vive en
  `engine/verticals.ts` (`vertical(kind)`, `verticalOf`, `hasFeature`, `copy`). Nada de `if (kind === …)` sueltos con textos:
  usar `v.copy.*` y `v.features.*`. Moods `pro_*` solo en corporativo (`checkMoodForEvent` ⇔ `mood_kind` + trigger
  `attendee_vertical`). Funciones apagadas en corporativo ⇒ `NOT_IN_VERTICAL` ⇔ `not_in_vertical`. El tipo no cambia con
  asistentes (`events_kind_locked`). Estrategia: `docs/producto/estrategia-corporativa.md`.
- **Perfiles múltiples (no negociable):** una cuenta = Perfil principal (`profiles`, noche) + hasta 5 `profile_personas`.
  Se elige al entrar (`event_attendees.persona_id`; obligatorio y profesional en corporativo). **Todo lo que se muestra de
  otra persona en el contexto de un evento pasa por `faceOf(state, userId, eventId)`** (grilla, perfil, bandeja, chat,
  plano, Squad/Equipo, CRM, LED): en corporativo nunca aparece la cara de la noche (sin perfil ⇒ cara neutra). Los
  contactos se muestran con la cara del evento de su conexión. `getProfile` queda para la cuenta propia y la lógica.
- **Privacidad por contexto (no negociable, v1.8):** `profiles` solo se lee la propia fila. Otras personas llegan como
  tarjeta (`profile_cards` ⇔ `profileAccess`/`publicCard`): edad y nunca fecha de nacimiento, teléfono ni email; @ y fotos
  solo con nivel "full". Perfiles profesionales ajenos por `persona_cards` (⇔ `sanitizePersonaFor`). Columnas privadas de
  `event_attendees` nunca por tabla (`ATTENDEE_COLUMNS` en sync; lo privado por `my_attendances` / `event_attendance` /
  `shared_zones`). Visibilidad entre asistentes = `canSeeAttendee` ⇔ `can_see_attendee`. Links a perfiles con
  `profileHref()` (por id si no hay @). El equipo solo ve pines de rescate.
- **Reuniones (v1.8):** solo por RPC (`request_meeting`, `respond_meeting`, `reschedule_meeting`, `cancel_meeting`); en la
  noche solo con matches; horario dentro del evento; cupo de sala (`spot_busy`) y agenda sin superposiciones
  (`meeting_conflict`) en motor y SQL; al aceptar se abre el chat. "Completada" se deriva (`displayStatus`).
- **Agenda multi-track (v1.11, solo corporativo: `features.agenda`):** charlas en `event_sessions` con hora LOCAL del
  evento (`day` + `start_time`/`end_time` "HH:MM", Argentina UTC-3: `localParts`/`localToMs` ⇔ `at time zone
  'America/Argentina/Buenos_Aires'`); `spot_id` = pin del plano ("Ubicar sala" → `/map?spot=<id>`). Misma sala sin dos
  charlas a la vez (`room_busy`, motor y trigger). Mi Agenda: los choques NO se bloquean, se avisan
  (`agendaConflicts`/`conflictMessage`) y se confirman o reemplazan (`replaceIds` ⇔ `p_replace`); el cupo sí
  (`session_full`). `enrolled_count`, `upvotes`, `results` e `is_live_now` los escribe solo el servidor (RPC). Q&A y
  encuestas solo con la charla en vivo (`not_live`); la **autoría de una pregunta nunca va en la pregunta**
  (`session_question_authors`, solo su autor/a, ni la organización); moderación y encuestas = dueño/a y producción
  (`admin.events` ⇔ `is_event_manager`). Las piezas de la agenda usan solo `pro-*` (`ProSurface`/`ProButton`).
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
| `pro-*` | navy `#0B1120` · slate `#0F172A` · alabaster `#F8FAFC` · cobalt `#1D4ED8` / sapphire `#2563EB` · gold `#D97706` · emerald `#059669` | **Solo ROUGE PRO**: `/pro` y las piezas ejecutivas de la app en eventos corporativos (ficha, pase, panel de la ficha, agenda y sala en vivo). Nunca en la noche |
| `text-primary` | `#F8FAFC` | Texto principal |
| `text-muted` | `#94A3B8` | Texto secundario |

- **Tipografía:** `font-display` = Space Grotesk (títulos, badges, métricas, contadores; 600/700,
  tracking tight) · `font-sans` = Plus Jakarta Sans (cuerpo, bios, chat; 400/500/600).
- **Plano:** Squad pulsa cian, Match pulsa rouge, Punto Base es bandera dorada.
- **Tarjetas de grilla:** `aspect-card` (3:4), `.card-fade`, badge de % afinidad, `.glass-pill` con el Mood.
- **Fotos de perfil: siempre verticales 3:4 y las encuadra la persona.** Al subir pasan por `PhotoCropper`
  (`react-easy-crop`, `lib/media/crop.ts`): la app nunca recorta sola. Se muestran enteras (`object-contain`);
  `MediaImage` rellena con la foto difuminada si queda alguna vieja con otra proporción. `Avatar` también es 3:4
  (`size` = alto, ancho = 3/4) con esquinas suaves, nunca un círculo. El loop también va entero.
- **Ergonomía:** botones ≥ 44px (`min-h-touch`), modales `BottomSheet`, una mano.
- No inventar colores nuevos: si hace falta un estado, usar opacidades de los tokens.
- Respetar `prefers-reduced-motion` (ya global en `globals.css`).

## Skills y pulido seguro

En `.claude/skills/` hay 14 skills importadas de `rampstackco/claude-skills` (MIT). La procedencia, la revisión de
seguridad y la política para sumar más están en `.claude/skills/README.md`. Son guías genéricas: **este archivo
manda**. Si una skill sugiere algo que contradice una regla de arriba (motor puro, RLS, privacidad, tokens de
diseño), gana la regla de ROUGE.

**Cuándo usar cada una en ROUGE**

| Tarea | Skill | Lo que importa en ROUGE |
|---|---|---|
| Revisar un diff o PR, debuggear | `code-review-web` | Regla de negocio fuera de `engine/` o UI que llama al motor sin `exec(C.…)` = bloqueante. Comando sin contraparte en `schema.sql` ni en `commands.test.ts` = bloqueante. |
| Seguridad / pre-lanzamiento | `security-baseline` | RLS en toda tabla, `security definer` con `search_path`, service role solo en `/api/*`, nada secreto con `NEXT_PUBLIC_`. CSP en `next.config.ts`: probarla en modo *Report-Only* antes (Spotify, Supabase, Meta y blobs de IndexedDB). |
| Accesibilidad | `accessibility-audit`, `frontend-component-build` | `min-h-touch` (44px), foco y ESC en `BottomSheet`, `aria-live` en `Toaster`/`LiveNotifications`, `prefers-reduced-motion`. El rescate tiene que andar con una mano, con lector de pantalla y sin banners encima. |
| Rendimiento | `performance-optimization`, `media-asset-management` | Pensar en baja señal: `compressImage()` antes de subir, `blur_color` como placeholder, Spotify lazy, SW cache-first. Nunca data URLs en el estado. |
| UI nueva o pulido visual | `design-standards`, `design-system` | Solo tokens de "Velvet & Laser" (sin colores nuevos). Verificar contraste AA de `text-muted` sobre `surface`. Probar a 375px dentro del shell `max-w-md`, y `/admin` también en desktop. |
| Formularios | `form-strategy`, `onboarding-wizard-design` | Validar en el motor (mismo mensaje en demo y Supabase) y en SQL; `type`/`autocomplete` correctos; input ≥16px (sin zoom en iOS). El onboarding guarda de a poco y nunca pierde lo cargado. |
| Tests de una feature o bug | `test-case-authoring`, `qa-testing` | Nivel más bajo que alcance: invariantes en `engine.test.ts`, contrato en `commands.test.ts`, RLS en integración, flujo en `e2e/`. Evidencia = salida real del runner. |
| Dependencias | `dependency-management` | Por defecto no agregar paquetes. Si hace falta, checklist de la skill + impacto en bundle + `npm audit`. |
| Operación de la noche | `monitoring-and-alerting` | Rutas críticas: ingreso, rescate, pedidos de barra y Realtime. Ver `docs/operaciones/checklist-lanzamiento-v1.md`. |

**Reglas para pulir sin romper**

- Un cambio por vez y con alcance claro. Los refactors grandes van en su propio commit, nunca mezclados con fixes.
- Antes de tocar algo, leer su test. Después: `npm run typecheck && npm test && npm run build`. Si tocaste
  `schema.sql` o `commands.ts`, también `npm run test:integration` (o decir que no se pudo correr y por qué).
- Nunca cambiar una aserción, un valor esperado o un fixture para que un test pase, salvo que el valor esperado
  estuviera mal (y decirlo).
- Las auditorías (a11y, rendimiento, seguridad) se entregan como hallazgos priorizados. Si falta una medición
  (Lighthouse, lector de pantalla, dispositivo real), se dice que falta: no se inventan números.
- Mejoras de UX no pueden quitar salvaguardas: bloqueos mutuos, mensaje genérico "no disponible", teléfono
  privado, audiencia manual de pines, rescate en 1 toque.

## Roadmap

- [x] **Fase 1** — Cimientos, identidad, esquema SQL, motor de reglas y Mock Data.
- [x] **Fase 2** — Onboarding/perfil (4 fotos comprimidas, loop 5s, géneros, Spotify), privacidad y bloqueos.
- [x] **Fase 3** — Ingreso `/join/[code]` + Mood, Line-up, grilla por afinidad, Ghost Mode, conexiones y Rompehielos.
- [x] **Fase 4** — Squads y seguridad, Pin-Drop 15 min, Punto Base, chat realtime (texto + fotos), Perks/QRs y Barra Express.
- [x] **Fase 5** — `/admin`: eventos y códigos, CRM + CSV, Text Blasts, perks y sorteos, Kanban de barra, Pantalla LED.
- [x] **Fase 6** — Roles de equipo (login por tipo de usuario, permisos en cliente y SQL), QR para todo link, landing pública.
- [x] **Fase 7** — Login con Google e Instagram, importar fotos del feed e Instagram (verificado) en el perfil.
- [x] **Fase 8** — API v1 para ticketeras: claves, un código por entrada, anulación, check-in y QR para el mail.
- [x] **Fase 9** — Marca (logo + colores) por evento, cobros con Mercado Pago por marca y cuentas de la mesa.
- [x] **Fase 10** — Gestión completa del evento (menú, nueva edición, expulsar, eliminar) y ticket de comanda.
- [x] **Fase 11** — RRPP con link y comisión, escáner de puerta y sitio público / organizadores separados.
- [x] **Fase 12** — Experiencia de escritorio, plataformas aisladas (/ops, /superadmin), staff por organización con kiosco
  y auditoría, QR dinámicos TOTP, listas free, puerta offline, RRPP escalonado, tablero 15', campañas WhatsApp y
  monetización (trago en chat, Mesa VIP dividida, cola virtual, Wrapped).
- [x] **Fase 13** — ROUGE Pro: eventos corporativos (`events.kind`), perfiles múltiples (`profile_personas`), privacidad
  por contexto (tarjetas saneadas, columnas privadas, ajustes), reuniones con sala/pin y `/empresas`.
- [x] **Fase 14** — ROUGE PRO (`/pro`): identidad ejecutiva, organizadores y asistentes separados, simulador, demo con modal y switch de modo.
- [x] **Fase 15** — ROUGE PRO Fase 1: ficha ejecutiva con contacto por nivel de privacidad, pase corporativo con vCard y control multi-zona por categoría.
- [x] **Fase 16** — ROUGE PRO Fase 2: agenda multi-track, "Mi Agenda" con choques de horario, "Ubicar sala" en el plano y Q&A / encuestas en vivo con moderación.
- [ ] **Próximo** — ver `docs/producto/competencia.md` y `docs/producto/estrategia-corporativa.md`: facturación ARCA,
  modo claro corporativo, SSO, lista de espera, entradas propias, Mesa VIP con seña.

## Convenciones

- Código y comentarios técnicos en español rioplatense neutro; identificadores en inglés.
- Campos en `snake_case` (igual que Postgres) en `types.ts`.
- Nada de `any`. Nuevas tablas ⇒ actualizar `types.ts`, `RougeState`, `seed.ts`, `schema.sql`.
- Antes de commitear: `npm run typecheck && npm test && npm run build`.
- Funcionalidad nueva ⇒ actualizar `docs/producto/funcionalidades.md` y el `CHANGELOG.md` (sección sin publicar).
