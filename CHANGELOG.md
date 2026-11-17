# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Cambiado
- **SEO / Google:** la landing (`/`) se renderiza en el servidor (antes Google recibía solo la pantalla "Cargando").
  Nuevos `robots.txt`, `sitemap.xml`, URL canónica `https://www.rougepass.com` (`SITE_URL`, pisable con
  `NEXT_PUBLIC_SITE_URL`), Open Graph + Twitter con imagen generada (`opengraph-image`) y datos estructurados
  (WebSite + Organization). Solo `/` se indexa: el resto lleva `noindex` desde el layout. El sitio de demostración
  (sin Supabase) y los previews de Vercel piden no ser indexados (`SITE_INDEXABLE`).
- **Fotos reales en el demo** para Sofía, Camila, Julieta, Mateo y Valentina (WebP 600×800 en
  `public/demo/avatars`, `src/lib/demo/photos.ts`); el resto sigue con retratos vectoriales. `STATE_VERSION` 9 (la demo
  se vuelve a sembrar). La maqueta del teléfono de la landing usa las mismas fotos.
- **La demo ya no se ve en el sitio principal.** El login muestra solo Instagram, Google y email (en Modo Demo abren
  una cuenta nueva y siguen al onboarding); las personas y roles del demo, el cambio de persona, los links de prueba,
  los botones "Simular…" y el badge "Modo Demo" aparecen recién después de entrar por **`/demo`** (queda recordado en
  ese navegador, `rouge:demo-access`). `/demo` suma el botón "Elegir persona". Ver `src/lib/demo/access.ts`.
- **Fotos de perfil verticales y encuadradas por cada persona:** al subir una foto (del teléfono o de Instagram) se
  abre el **encuadre 3:4**: se arrastra y se acerca (con dos dedos o con la barra) para elegir qué se ve. La app ya no
  recorta nada por su cuenta: las fotos se ven enteras en la grilla, el perfil, el editor y la puerta, y los avatares
  pasan de círculo a vertical 3:4 con esquinas suaves. El loop de video también se ve entero.
- Nueva dependencia: `react-easy-crop` (encuadre con arrastre y pellizco).
- **Nuevo nombre: Rouge Pass** (antes ROUGE). Cambian los textos visibles: wordmark (ROUGE **PASS**), metadata y
  nombre de la PWA, landing pública y de organizadores, demo, login, onboarding, mensajes al compartir, ticket y QRs
  impresos, nombre de la API (`Rouge Pass API`) y documentación. Constante única `APP_NAME` en `src/lib/brand.ts` y
  componente `<Wordmark />`.
- **Sin cambios internos** (compatibles con lo que ya está en producción): token de color `rouge`, QR
  `ROUGE:ORDER:` / `ROUGE:PASS:` (entradas y tickets ya emitidos siguen andando), claves `rouge:*` del navegador y
  email interno de las cuentas de Instagram.

### Agregado — Creador modular de eventos y módulos por evento (v1.8)
- **Módulos por evento** (`EventFeatureFlags`, `engine/features.ts`): 13 interruptores en 4 categorías (acceso y
  puerta, social, grupos y mapa, barra y beneficios) con **dependencias** (regalar tragos exige Barra + Chat; Vaquita
  exige Squads; listas free exige Entradas) y **5 presets** de 1 clic. Eventos anteriores: todo prendido.
- **La app se adapta**: barra inferior y sidebar muestran solo los módulos prendidos; una ruta apagada vuelve a `/app`
  con un aviso; el panel del dueño/a marca las secciones apagadas ("Off") y no las abre; `/ops` igual. Cada acción
  del motor y su RPC valida su módulo (`event_feature` en SQL, error `feature_disabled`).
- **Creador modular** (`EventBuilderWizard`): datos, link `/join`, organización dueña, ciclo de vida
  (borrador/preventa/en vivo/terminado), aforo, listas free (hora límite y precio tardío), line-up, estética y módulos.
  Hoy lo usa **ROUGE HQ** en `/superadmin` → *Creador de eventos* (también módulos en vivo y autogestión por
  organización). Con `allow_owner_self_service` el dueño/a usa **el mismo componente** desde `/admin/events`.
- SQL: `events.features`, `events.lifecycle_status`, `organization_settings`, `event_feature`, `can_manage_modules`,
  `resolve_features`, `builder_save_event`, `set_event_features`, `sa_set_owner_self_service`; `join_event` rechaza
  borradores (`event_draft`).

### Cambiado
- Crear eventos ya no está abierto a cualquier cuenta: es de ROUGE HQ o de organizaciones con autogestión.

### Agregado — Experiencia en PC y tablet
- **Layout fluido**: en tablet/PC (≥ 768px) la app del asistente deja el "teléfono recortado": sidebar izquierdo
  fijo (riel de íconos en tablet, expandible/colapsable en PC con **Ctrl/⌘ + B**), indicadores en vivo (bandeja,
  rescate, invitaciones, perks, pedidos listos), selector del evento activo y acceso al perfil. Contenido hasta
  `max-w-7xl`; las pantallas de lectura (perfil, ajustes) en `max-w-3xl`. En móvil sigue la barra inferior.
- **Lobby**: grilla de 2 → 5 columnas, buscador por nombre/@usuario, filtros de mood y géneros fijos en la cabecera
  y **vista previa del perfil en un panel derecho** (sin perder el scroll de la grilla).
- **Bandeja y chat**: vista dividida (conversaciones 35% · chat 65%) con el perfil del contacto en pantallas anchas.
- **Barra Express**: catálogo en grilla y **pedido persistente en columna derecha** (total, entrega, Vaquita, pago y
  QR de retiro sin modales). **Perks**: QRs en grilla, QR seleccionado y avisos en columna lateral.
- **Squad**: tres columnas (plano en vivo · integrantes y pines · chat grupal o cuentas de la mesa).
  **Plano**: mapa grande con la lista de quién está en el plano.
- Modales (`BottomSheet`) como diálogos centrados en PC; avisos arriba a la derecha.
- **Panel del organizador**: cabeceras fijas, tablas de alta densidad con encabezado fijo (CRM, RRPP), atajos
  (**Alt + 1…9** secciones, **/** buscar, **?** ayuda), transiciones suaves y ancho extra en monitores 2xl.
  `/demo` aprovecha monitores anchos.

### Agregado — Seguridad, plataformas y staff
- **Superficies de plataforma** (`PlatformSurface`: `client_app`, `staff_ops`, `owner_admin`, `super_admin`) y roles de
  plataforma (`PlatformStaffRole`: owner, manager, door_scanner, bar_pos, rrpp) mapeados desde el enum de la base sin
  renombrarlo. `canAccessPath()` decide en el cliente (AppShell, AdminChrome, OpsChrome) con la misma regla que exigen
  las RPCs (`has_staff_role` con asignaciones y ventana horaria; `is_platform_admin`).
- **Plataforma operativa `/ops`** (Puerta y Barra): alto contraste, botones grandes; Puerta y Barra en turno no pueden
  abrir lobby, CRM ni finanzas (se los redirige). `/ops/door` suma alertas de rescate y reportes en vivo; `/ops/bar` es
  ventanilla + comandas de un toque.
- **Staff por organización**: invitaciones de **1 uso por link/QR** (vencen a las 2 h; se guarda solo el SHA-256 del
  token) con rol, alcance (todos los eventos de la organización, también futuros, o algunos) y **ventana horaria
  automática** (2 h antes del inicio → 1 h después del cierre). Página `/equipo/<token>` para aceptar.
- **Kill switch**: baja inmediata de un integrante en toda la organización (asignaciones, equipo de cada evento y PIN).
- **Modo Kiosco**: terminal fija con la cuenta de dueño/a o producción; cada integrante opera con su **PIN de 4–6
  dígitos** (bcrypt en el servidor, PINs triviales rechazados, 5 errores → 5 min bloqueada, auto-bloqueo a los 90 s).
- **Auditoría inmutable** (append-only, triggers en SQL): altas/bajas, roles, PINs, kiosco, entregas, check-ins,
  cambios de precio, anulaciones, reportes. Panel con filtros y CSV.
- **Reportar usuario** (con bloqueo mutuo opcional): alerta en vivo al panel de seguridad. **Borrado real de la cuenta**
  desde Privacidad (`delete_my_account` + `/api/account` borra el usuario de Auth).
- **Privacidad del lobby**: opción por evento para que solo aparezca en la grilla quien ya ingresó por la puerta.
- **+18 y términos** explícitos en el onboarding; páginas `/legal/terminos`, `/legal/privacidad` y **Botón de
  arrepentimiento** (`/legal/arrepentimiento`, Res. 424/2020, con código de seguimiento).
- **Cabeceras seguras** (CSP, HSTS, X-Frame-Options DENY en producción, nosniff, Referrer/Permissions-Policy) y **rate
  limiting** por IP en `src/proxy.ts` (API v1, OAuth, cobros, login, /join, /equipo).

### Cambiado — Seguridad
- **Mercado Pago**: la firma `x-signature` del webhook es obligatoria (sin secreto responde 503) y la acreditación exige
  además el `collector_id` de la cuenta del organizador. **Instagram**: tokens cifrados en reposo con AES-256-GCM
  (`TOKEN_ENCRYPTION_KEY` o `MP_TOKEN_KEY`; los heredados en texto plano se siguen leyendo).
- Fotos: `preserveExif: false` explícito (la recodificación a WebP elimina EXIF/GPS).
- Barra y mozo/a van a `/ops/bar`; seguridad a `/ops/door`.

### Agregado — QR anti-fraude, listas free y puerta sin conexión
- **QR dinámicos TOTP** para el pase de entrada, los perks y los vouchers de barra: rotan cada **20 s**
  (`ROUGE:T1:<tipo>:<ref>:<paso>:<firma HMAC>`), con tolerancia de ±1 ciclo y un **anillo de cuenta regresiva** "EN
  VIVO" para que se note que no es una captura. El asistente solo recibe el secreto de SUS credenciales
  (`my_qr_secrets`); la puerta y la barra, el del evento (`event_qr_secret`). Los QR fijos viejos se rechazan.
- **Escaneo atómico**: `door_scan` (FOR UPDATE) — con dos terminales a la vez solo entra el primero; el segundo ve
  alerta roja "Ya entró" con la hora y la **terminal** que lo consumió. Barra: "ya canjeado/entregado a las HH:MM".
- **Listas Free con conversión tardía**: listas con hora límite y precio diferencial (`ticket_lists`); pasada la hora,
  la puerta muestra "Fuera de horario Free" con el monto y cobra en el acto (efectivo, Mercado Pago o transferencia)
  antes de dejar pasar (`door_settle_late`). Panel para crear listas y generar sus entradas.
- **Puerta sin conexión**: padrón del evento (hashes SHA-256 de entradas, quemadas, pases y listas) guardado **cifrado**
  (AES-GCM, clave no exportable en IndexedDB); valida sin red, encola y **reconcilia** al volver la conexión
  (`door_reconcile`, informa dobles usos). `/ops/door` queda en el Service Worker. **Búsqueda manual** por nombre, DNI,
  email o @usuario para quien se quedó sin batería.

### Agregado — Consola global, B2B y monetización
- **Consola global `/superadmin`** (solo `platform_admins`): tablero de eventos y boliches (estado, ingresados/vendidos,
  aforo, cobros en puerta, barra, staff, alertas), control transversal de asistentes (ver perfil, check-in manual,
  anular/reenviar entrada, ocultar del lobby, expulsar) y matriz global de staff con baja remota. RPCs
  `superadmin_snapshot`, `superadmin_search` y `sa_*`, todas auditadas.
- **Liquidación escalonada de RRPP**: precio de entrada + tramos marginales por cantidad (ej. 1–30 al 15 %, desde la 31
  al 20 %) + % sobre el consumo en barra de sus invitados; editor con vista previa y CSV de liquidación con desglose.
- **Tablero minuto a minuto** en `/admin`: ingresos en puerta y ventas de barra cada 15' contra el promedio de las
  últimas fechas de la organización (`org_event_curves`), ritmo de ingreso y ticket promedio, con tooltip y vista de tabla.
- **Campañas por WhatsApp sin API paga**: segmentos (cumpleañeros de la semana, VIP de alto consumo, inactivos > 30 días,
  invitados por RRPP), plantillas con `{nombre}`, `{evento}`, `{beneficio}`, `{link_qr}` y bandeja `wa.me` con estado
  "Contactado" (`org_contacts`, `campaigns`, `campaign_contacts`).
- **Invitar un trago desde el chat** (y desde la celebración del match): se paga con Mercado Pago y el QR le llega a la
  otra persona al acreditarse (`gift_drink`).
- **Mesa VIP dividida**: una cuota por integrante del Squad, cada uno paga la suya; al 100 % se libera el QR grupal
  (`create_vip_reservation`; `confirm_order_payment` emite el QR una sola vez).
- **Cola virtual**: posición en la cola de la barra y notificación del sistema (Service Worker) cuando el pedido está
  listo. **Rouge Wrapped** (`/wrapped`): tarjeta 9:16 de la noche para compartir en Stories (PNG 1080×1920).

### Pendientes conocidos
- Web Push con la PWA cerrada necesita claves VAPID y un emisor en el servidor (hoy el aviso funciona con la app
  abierta o minimizada).
- Cobro del diferencial de listas free con Mercado Pago: se registra el método; el link/QR de cobro es el del local.
- API v1: los datos del titular (nombre, DNI, email) para la búsqueda manual todavía no se reciben por la API.
- `npm run test:integration` no se pudo correr en este entorno (requiere un Supabase de prueba): correrlo antes de
  desplegar `schema.sql`.

## [1.6.0] — 2026-11-16

### Agregado
- **RRPP:** nuevo tipo de usuario del equipo (📣 RRPP) con **link y QR propios** por evento (`/join/RP…`). Quien
  entra por ese link queda a su nombre (primer contacto). El RRPP ve solo sus números (ingresos por su link, ingresos
  en la puerta y lo que tiene para cobrar), nunca datos de las personas, y no ve pines, squads, pedidos ni CRM. Dueño/a
  y producción ven el ranking, fijan la **comisión por ingreso** y exportan la **liquidación en CSV** (`/admin/rrpp`).
  Si el evento usa el escáner, se liquida por ingreso confirmado en la puerta.
- **Escáner en la puerta** (`/admin/door`, dueño/a, producción y seguridad): cámara del celular (lector nativo o
  jsQR) o código tipeado. Valida la **entrada** (QR del código de 1 uso) y el **pase de la app** (Inicio → *Mi
  entrada*), y muestra foto, nombre y edad para comparar con quien entra. Rechaza anuladas, expulsados, pases de otro
  evento y el link general; avisa "Ya entró" con la hora. Contador de gente adentro.
- **Mi entrada:** el asistente muestra su pase con QR desde el inicio.
- **Cámara en la ventanilla de la barra** para escanear los QR de retiro y de perks.
- **Sitio dividido:** `/` es solo para el público (ventajas, preguntas, sin CRM, ventas ni planes; queda un acceso
  discreto "Acceso equipo"). **`/organizadores`** es el sitio para dueños y productoras (CRM, ventas, barra, RRPP,
  puerta, planes), **oculto**: no se indexa y no se enlaza desde `/`.
- SQL: rol `promoter`, tabla `promoter_links`, columnas `referred_by` / `checked_in_at` (asistentes) y
  `checked_in_at` / `checked_in_by` (códigos), RPCs `ensure_promoter_link`, `set_promoter_commission`,
  `promoter_stats`, `door_check_in`; `join_event` y `resolve_access_code` aceptan el link del RRPP.

### Cambiado
- `is_event_staff` no incluye al RRPP (no ve datos del evento como el resto del equipo).
- Modo Demo: nueva versión del estado con la RRPP Victoria, su link y los ingresos de la puerta.

## [1.5.0] — 2026-11-16

### Agregado
- **Ticket / recibo imprimible** desde cada comanda (Barra / POS → 🖨️): formato térmico de 80 mm con número de
  comanda, código y QR de retiro, ítems, total y estado de pago; se imprime solo y tiene copia cliente / barra.
  Comprobante interno (no es factura).
- **Gestión completa del evento por el organizador:**
  - **Menú de la barra** (`/admin/menu`): alta, edición, precios y "Agotado" en un toque (el público lo ve agotado y
    el servidor no lo vende), baja de ítems.
  - **Nueva edición**: duplicar el evento para otra fecha con marca, plano, line-up, menú y reglas de perks corridos.
  - **Expulsar asistentes** desde el CRM, con bloqueo opcional de reingreso a ese evento y lista para volver a permitir.
  - **Eliminar** un evento creado por error o de prueba (solo quien lo creó y si todavía no entró nadie).
- Tabla `event_bans`, RPC `remove_attendee`, política `events_delete` y trigger `events_keep_payments`; `join_event`
  rechaza a expulsados (`banned`).
- Documentación: [guía de producción paso a paso](docs/operaciones/guia-produccion-paso-a-paso.md) y
  [competencia y faltantes](docs/producto/competencia.md). Piezas comerciales en `marketing/organizadores/`
  (`scripts/generate-promo.cjs`).

### Producción
- Base de datos de producción instalada, URL de login apuntando a `rouge-neon.vercel.app`, limpieza de pines con
  `pg_cron`, `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_DEMO_URL` en Vercel y sitio de demo `rouge-demo.vercel.app`.

### Cambiado
- `bar_menu` incluye `is_available`; el Modo Demo se vuelve a sembrar (versión 7 del estado).

## [1.4.0] — 2026-11-16

### Agregado
- **Marca y personalización** (*Marca y cobros*, `/admin/brand`): cada marca carga su logo y dos colores (principal y
  acento) con vista previa en vivo; la app del asistente, la invitación `/join`, la Pantalla LED y los QRs impresos se
  ven con esa identidad. Cada evento usa la marca de quien lo creó o personaliza esa edición. Controles de contraste
  (en el motor y en Postgres) y el Rescate 🚨 siempre rojo / Squad siempre cian.
- **Cobros con Mercado Pago por marca:** OAuth de Marketplace (`/api/mercadopago/*`), tokens cifrados con AES-256-GCM,
  Checkout Pro con `marketplace_fee` (comisión de ROUGE automática), webhook con firma `x-signature` y conciliación.
  Los pedidos nacen "esperando pago" y la barra solo prepara lo pagado; se puede reintentar o cancelar.
  En el Modo Demo la conexión y el checkout se simulan.
- **Pedidos compartidos:** se elige con quiénes del Squad se comparte un pedido (también una botella con delivery a la mesa).
- **Cuentas de la mesa** (`/squad/cuentas`): quién pagó qué (pedidos compartidos + gastos cargados a mano), saldos,
  transferencias mínimas para quedar a mano, alias/CBU para cobrar (visible solo dentro del Squad), "Ya le pagué" con
  confirmación de quien recibe. Disponible después del cierre del lobby.
- Avisos en vivo: pago acreditado y transferencias para confirmar.
- Tablas `brands`, `brand_payment_accounts`, `squad_expenses`, `squad_settlements`, `payout_aliases`; RPCs
  `confirm_order_payment` (solo servidor), `cancel_unpaid_order`, `my_brand_payments`, `add_squad_expense`,
  `record_settlement`, `respond_settlement`. Documentación: [Mercado Pago](docs/tecnica/mercadopago.md).

### Cambiado
- Los colores `rouge` y `vip` son variables CSS (`--c-rouge`, `--c-vip`); nuevo token fijo `sos` para el rescate.
- El gasto de un pedido (CRM) se suma cuando se acredita el pago; las ventas del panel no cuentan pedidos sin pagar.
- La barra (staff) solo puede cambiar el estado de las comandas, no el de pago (privilegios por columna).
- Modo Demo: nueva versión del estado (se vuelve a sembrar) con la marca "ROUGE Night" y Mercado Pago conectado.

### Pendientes conocidos
- Reembolsos desde el panel (hoy desde Mercado Pago).
- El Trago Rompehielos todavía se cobra en la barra.
- Las transferencias entre amigos se hacen fuera de ROUGE (alias copiado): Mercado Pago no ofrece P2P por API.

## [1.3.0] — 2026-11-15

### Agregado
- **Demo en vivo para anfitriones** en `/demo` (no indexada): guion de 7 minutos con botones que abren el teléfono y
  el panel con el rol justo, accesos a cada vista sin contraseñas y QR para compartir.
- **Modo presentador** en `/demo/presentador`: teléfono y panel lado a lado en una sola pantalla, sincronizados, con
  pasos del guion, cambio de rol, Pantalla LED y reinicio.
- Persona por marco en el Modo Demo (`window.name`): cada pestaña o iframe puede ser una persona distinta.
- `NEXT_PUBLIC_DEMO_URL`: en el sitio con datos reales, `/demo` manda al sitio de demostración.

### Cambiado
- La pantalla principal ya no tiene nada de la demo: "Tengo una entrada" (`/join`), "Soy organizador" (login de
  equipo) y accesos reales en el pie; sin atajos para entrar como un rol ni la fiesta de ejemplo en el hero.

### Corregido
- Una pestaña vieja que se cerraba podía revivir la fiesta anterior después de "Reiniciar demo" (ahora nunca se
  guarda encima de una fiesta más nueva).
- Fondos tenues que no se veían (badges, ítem activo del menú del panel, chips y avisos): usaban una opacidad
  `/12` que Tailwind no genera; ahora `/15`.

## [1.2.1] — 2026-11-15

Revisión visual completa (81 combinaciones de pantalla × tamaño × rol, más el arranque).

### Corregido
- Inicio: se quitó la tarjeta interna "Roadmap del MVP" que veían los asistentes.
- Plano: las etiquetas de pines y del Punto Base ya no se pisan (se muestra la más importante; al acercar
  vuelven), los marcadores en el mismo lugar se separan y los nombres de sectores siempre entran en su recuadro
  (y van abajo cuando hay otro sector pegado arriba).
- Panel en celular: Eventos y accesos, Text Blasts y Perks y sorteos se salían de la pantalla (scroll horizontal).
- Panel en tablet: en el line-up el nombre del artista quedaba aplastado a una letra.
- Barra / POS y hoja imprimible de QRs: encabezados que se cortaban en celular.
- Links chicos del Inicio y del Squad: ahora miden 44 px de alto para tocarlos con el dedo.
- Landing 3D en celular: el encabezado del hero ("NEXT-GEN NIGHTLIFE…" / "EN VIVO…") queda en dos renglones
  alineados, sin sangría ni texto huérfano.
- Landing 3D: las preguntas frecuentes y los links del pie tienen un fondo translúcido para leerse aunque la
  escena 3D pase por detrás.

## [1.2.0] — 2026-11-15

Primera versión publicada en producción.

### Cambiado
- **Landing comercial 3D** en `/` (reemplaza la anterior): escena WebGL procedural con React Three Fiber que se
  transforma con el scroll, scroll suave con Lenis + GSAP ScrollTrigger, tipografía cinética, cursor magnético,
  iPhone fijo con los 4 pilares, plano interactivo "Tocá el club", tarjetas Smart Bar con tilt 3D, sección B2B con
  pestañas del panel y calculadora de ROI, planes, FAQ y footer monumental. CTAs directos a `/app` y `/admin`
  (en demo, entran como el equipo del evento sin pasar por el selector).

### Agregado
- Dependencias: `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `@gsap/react`, `lenis`, `framer-motion`
  (solo se cargan en la landing).
- Service Worker `rouge-v3`: al publicar, los teléfonos descartan la caché anterior.

## [1.1.0] — 2026-11-15

### Agregado
- **API v1 para ticketeras y productoras** (`/api/v1`, guía en [docs/api](docs/api/README.md), OpenAPI en
  `/api/v1/openapi.json`): claves por organizador (por evento o todos sus eventos, SHA-256, revocables), un código por
  entrada idempotente por `external_ref`, códigos por cantidad, listado con filtros y cursor, estado y check-in
  (`status=used&used_since`), anulación por reembolso y QR en PNG/SVG para el mail de la entrada.
- Panel: *API para ticketeras* (crear/revocar claves, ejemplo listo para copiar) y tabla de códigos con número de
  entrada, etiqueta, origen, filtro de anulados, botón para anular y CSV ampliado.

### Cambiado
- Los códigos de 1 uso nuevos tienen 10 caracteres (≈ 2^50 combinaciones) del mismo alfabeto sin 0/O/1/I. Los
  existentes siguen funcionando.
- Un código anulado es inválido para entrar (panel, API y `join_event`).

### Corregido
- La carga del estado pedía todos los perfiles en una sola URL (`in (...)`): con ~100 personas el gateway la
  rechazaba y el panel quedaba sin datos. Ahora se piden por tandas de 60.

### Seguridad
- Funciones internas (`purge_expired_pins`, `apply_squad_perk_rules` y las `api_*`) cerradas también para `PUBLIC`
  (Postgres concede `EXECUTE` a `PUBLIC` por defecto).

## [1.0.0] — 2026-11-15

Primera versión. Catálogo completo en [docs/producto/funcionalidades.md](docs/producto/funcionalidades.md).

### Asistentes
- Perfil persistente para todas las fiestas: 4 fotos comprimidas a WebP, loop de 5 s sin audio, géneros, Spotify,
  Instagram (verificado o manual), teléfono privado y lista negra por teléfono.
- Ingreso por link maestro, código de 1 uso o link de Squad, con vista previa y Mood de la noche.
- Lobby por afinidad musical con filtros (géneros, moods, "coincidieron en tu zona"), Conectar con match recíproco,
  Rompehielos único por evento con trago de regalo, Modo Solo Amigos y bandeja.
- Squads con Rescate 🚨 en 1 toque, Llegué a casa, Punto Base y Mesa VIP; QR Drops grupales.
- Plano con pines de 15 minutos y audiencia elegida a mano.
- Chats 1:1 y de Squad en tiempo real con fotos; los chats 1:1 quedan después del evento.
- Barra Express: retiro con QR, delivery a pin o Mesa VIP, Vaquita y estado en vivo.
- Billetera de QRs, sorteos, Text Blasts / Flash Promos, pedido y votación de temas, line-up.
- Notificaciones en vivo sin tapar acciones críticas.

### Organizadores y equipo
- Panel con Resumen de ROI (ventas por la app, ticket promedio, filas evitadas, embudo, top consumo).
- Eventos y accesos: lobby con horario, plano subido, line-up, link maestro con QR, códigos de 1 uso (CSV, QR por
  código y hoja imprimible).
- CRM con Smart Tags y WhatsApp, Text Blasts segmentados, perks y ruleta de sorteo, Kanban de comandas con
  ventanilla rápida, Pantalla LED para proyector.
- Roles del equipo (Dueño/a, Producción, Barra, Mozo/a, Seguridad) con permisos exigidos por el servidor; panel de
  Seguridad con alertas de rescate en vivo.

### Acceso
- Login por tipo de usuario (Asistente / Equipo) con link mágico, Google e Instagram.
- Conectar Instagram e importar fotos del feed.

### Plataforma
- PWA instalable con Service Worker y página sin conexión; pensada para mala señal.
- Modo Demo automático sin backend (fiesta en vivo precargada, personas y roles, login social simulado).
- Supabase: RLS en todas las tablas, RPCs que replican el motor de reglas, Realtime y Storage.
- Landing pública con capturas reales y "todo link es un QR".
- Tests: unitarios y de contrato con el esquema, integración real contra Supabase y E2E con Playwright (`e2e/`).

### Pendientes conocidos
- Editor del menú de la barra en el panel (hoy se edita en Supabase).
- Fotos de chat con URLs firmadas (hoy cualquier usuario autenticado con la URL puede verlas).
- Borrado de cuenta en autoservicio (hoy a pedido).
- Reportes y moderación de contenido.
- Lector de QR con cámara en la ventanilla (hoy código o lector tipo teclado).
- Instagram solo para cuentas profesionales (limitación de Meta).
- Demo con varios teléfonos reales requiere Supabase de staging (el Modo Demo sincroniza pestañas del mismo navegador).
