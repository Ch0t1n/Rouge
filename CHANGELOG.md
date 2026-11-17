# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado
- **Analíticas de Vercel** (`@vercel/analytics`): vistas de página sin cookies en los despliegues de Vercel. Las URLs
  salen sin query ni fragmento y con los segmentos privados ocultos (`/join/[code]`, `/u/[username]`,
  `/chat/[connectionId]`). Se activa en Vercel → Analytics.

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
