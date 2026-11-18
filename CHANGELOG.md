# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Agregado (v1.11 · ROUGE PRO Fase 2: agenda multi-track, Mi Agenda y Q&A / encuestas en vivo)
- **Agenda & Charlas** en el panel (`/admin/agenda`, solo eventos corporativos; dueño/a y producción):
  `OrganizerScheduleManager` crea, edita y borra charlas con título, descripción, **track**, **sala** (vinculada a un pin
  del plano indoor, `venue_spots`), día, horario, cupo y hasta 6 **oradores** (nombre, cargo, empresa, foto; opcionalmente
  vinculados a un perfil del evento). Varias salas en paralelo, pero la misma sala no tiene dos charlas a la vez
  (`room_busy`). Botón **Activar En Vivo / Terminar en vivo** por charla y moderación en el mismo lugar.
- **Agenda para asistentes** (`/agenda`, `CorporateScheduleView`): filtros por **Día**, **Sala** y **Track**, toggle
  **Ver solo Mi Agenda**, charlas agrupadas por franja ("2 en paralelo"), tarjetas con horario, duración, badge de track
  con tonos formales, sala, oradores y cupo, y **⭐ Agendar / Agendado ✓**. Banda "En vivo" y acceso desde el inicio.
- **Choques de horario:** al agendar una charla que se superpone, aviso con el nombre y la hora de la otra
  ("Se superpone con «…» a las 15:00 hs") y dos salidas: **Reemplazar** (sale la otra en la misma operación) o
  **Agendar igual**. El cupo de la charla se respeta en el servidor (`session_full`).
- **Ubicar sala en el mapa:** abre el plano (`/map?spot=<id>`) acercado y centrado en el pin de la sala, resaltado, con
  las charlas que vienen en esa sala.
- **Sala en vivo por charla** (`/agenda/<id>`, `SessionLiveInteraction`): **Preguntas al orador** (con nombre ·
  empresa o anónima; lista por votos ▲; no se vota la propia; hasta 5 abiertas por persona) y **Encuestas rápidas**
  (voto en un toque, porcentajes con barras después de votar, voto cambiable mientras está abierta). Vista de
  moderación: **Destacar** (una por charla), **Marcar como respondida**, **Reabrir**, **Ocultar/Mostrar**, lanzar y
  cerrar encuestas. Terminar el en vivo cierra la encuesta abierta.
- SQL: `event_sessions` (+ trigger `session_check`, column privileges: `enrolled_count` e `is_live_now` solo por RPC),
  `session_enrollments`, `session_questions`, `session_question_authors` (la autoría nunca viaja con la pregunta),
  `session_question_votes`, `session_polls`, `session_poll_votes`; RPCs `enroll_session`, `unenroll_session`,
  `set_session_live`, `ask_question`, `vote_question`, `moderate_question`, `launch_poll`, `close_poll`, `vote_poll`.
- Motor `engine/schedule.ts` (espejo 1:1) y comandos nuevos en `commands.ts`. Feature `agenda` en `verticals.ts`.
- Tests: `schedule.test.ts`, contrato de los 12 comandos nuevos, caso de integración real, escenario SQL en Postgres 16
  y E2E `demo-pro-agenda.cjs`.

### Cambiado (v1.11)
- Modo Demo: versión 15 del estado (6 charlas en 3 tracks y 3 salas con pin, una en vivo con preguntas y encuesta).
- Integración con `main` (v1.7/v1.8: QR dinámicos, plataformas, módulos por evento): el pase corporativo usa el QR
  dinámico TOTP; el escáner por zona (`zone_check_in` ⇔ `zoneCheckIn`) usa la misma identidad que `door_scan` (el pase
  fijo se rechaza como captura) y en las puertas delega en `door_scan` (terminal, "Ya entró", listas free). El escáner
  conserva el modo sin conexión para la puerta principal; las áreas necesitan conexión. Helpers SQL de v1.10/v1.11 en `private`.
- `/pro`: "Preguntas al orador" deja de figurar como "Próximamente"; la tarjeta de agenda para asistentes describe
  Mi Agenda, Q&A y encuestas.

### Agregado (v1.10 · ROUGE PRO Fase 1: ficha ejecutiva, vCard y multi-zona)
- **Ficha ejecutiva** en eventos corporativos (`ExecutiveProfileCard`): avatar profesional único, nombre, cargo,
  empresa, rubro, bio profesional (hasta 240), "Qué busco / Qué ofrezco" (opciones + detalle libre), LinkedIn y sitio
  web, con la paleta ejecutiva de ROUGE PRO. En un evento corporativo, "Así te ven" y el perfil de otra persona usan la
  ficha: sin fotos de fiesta, loop, música, edad, Instagram, Squad ni Rescate. La noche no cambia.
- **Contacto con privacidad por nivel** (`profile_personas.contact_email`, `contact_phone`, `privacy_level`):
  `strict` (por defecto: solo tras una reunión o un contacto aceptado), `network` (además, quienes asisten a los eventos
  donde se usa el perfil) y `public` (además, la organización: CRM y exportación). Es un contacto aparte: el teléfono de
  la cuenta sigue sin mostrarse nunca. Espejo: `personaContactVisible` ⇔ `persona_contact_visible`.
- **Panel rápido de la ficha** (`CorporateProfileSheet`): se abre solo la primera vez que alguien entra a un evento
  corporativo sin perfil profesional y permite crearla sin salir del ingreso. "Revisar mi ficha" desde el ingreso y
  "Editar ficha" desde el perfil. El editor completo (`/profile/personas/edit`) usa los mismos campos.
- **Pase corporativo** (`CorporatePassView`): QR de acceso con la **categoría** (ASISTENTE, SPEAKER, VIP, PRENSA, SPONSOR),
  "Tus accesos" por zona, switch **QR de Acceso ⇄ QR Tarjeta personal (vCard)** y **Guardar contacto (.vcf)** (descarga o
  hoja de compartir del celular) con email y teléfono opcionales y la nota "NETWORKING: Conocido en <evento>".
  Desde la ficha de otra persona también se guarda su contacto, solo con los datos que se pueden ver.
- **Categorías** (`event_attendees.tier`, `event_invite_codes.tier`): el código de 1 uso da su categoría al entrar; la
  organización la cambia desde el CRM (`set_attendee_tier`) y genera lotes de códigos por categoría.
- **Control de acceso multi-zona**: zonas por evento (`event_zones`: puertas que acreditan y áreas con categorías
  habilitadas), selector **obligatorio** de "Zona de control activa" en el escáner, verde con nombre, empresa y categoría
  o rojo con el motivo ("Requiere VIP / SPEAKER"), y registro de cada lectura (`zone_check_ins`: persona, zona, hora,
  personal y resultado) con "Últimas lecturas". RPC `zone_check_in`; `door_check_in` es la puerta principal. Panel de
  zonas para dueño/a y producción. Sin zonas cargadas, la puerta funciona como siempre.
- `src/lib/vcard.ts`: vCard 3.0 pura (escapes, plegado a 75 octetos, CRLF).
- Tests: `executive.test.ts` (ficha, privacidad del contacto, categorías, zonas y vCard), contrato de los comandos nuevos,
  escenario SQL en Postgres 16 y E2E `demo-pro-ficha-zonas.cjs`.

### Cambiado (v1.10)
- En corporativo, la puerta muestra la cara profesional (nombre, cargo, empresa y categoría, sin edad ni la cara de la
  noche). Una vCard escaneada en la puerta avisa que no es un pase.
- Las fuentes de ROUGE PRO (Inter + JetBrains Mono) se comparten desde `components/pro/fonts.ts`.
- Modo Demo: versión 11 del estado (zonas, categorías, fichas con contacto y lecturas sembradas).

### Agregado (v1.9 · ROUGE PRO)
- **`/pro`: landing corporativa de ROUGE PRO** con identidad ejecutiva propia (paleta navy/slate/alabaster, cobalto y
  dorado; Inter + JetBrains Mono solo en esa ruta) y metadata propia ("ROUGE PRO | Plataforma Integral para Eventos
  Corporativos y Networking"). Secciones: navbar ejecutivo, hero con maqueta 3D en capas animada con GSAP (pase con QR,
  reunión confirmada, check-in en vivo), **ventajas separadas para quien organiza y para quien asiste**, control de
  acceso con escáner simulado, tablero de salas sin doble reserva, privacidad (qué ve otro asistente / permisos por
  rol), casos de uso en pestañas accesibles, **simulador del centro de comando** (embudo de acreditación, reuniones y
  ocupación de salas, export CSV) y pedido de **demo ejecutiva** en línea o en modal. Lo que todavía no existe se marca
  "Próximamente".
- **Switch Nightlife ⇄ PRO** en el header de la landing principal y en el de `/pro`.
- Leads: campo **Cargo** (`b2b_leads.job_title`) y tipo de evento **Feria o exposición** (`expo`).

### Cambiado (v1.9)
- `/empresas` redirige (308) a `/pro`; se quitó la página anterior. El footer de `/organizadores` enlaza a `/pro`.
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

### Agregado
- **Analíticas de Vercel** (`@vercel/analytics`): vistas de página sin cookies en los despliegues de Vercel. Las URLs
  salen sin query ni fragmento y con los segmentos privados ocultos (`/join/[code]`, `/u/[username]`,
  `/chat/[connectionId]`). Se activa en Vercel → Analytics.

### Agregado
- **SEO de la landing pública:** título y descripción con las búsquedas reales ("app para fiestas y boliches",
  "conocer gente", "pedir tragos sin fila"), canonical, Open Graph / X con imagen propia (`/opengraph-image`),
  datos estructurados schema.org (`Organization`, `WebSite`, `WebApplication` gratuita, `FAQPage`), `robots.txt` y
  `sitemap.xml`. `/join`, `/login` y `/offline` no se indexan (los links de ingreso nunca aparecen en Google).
- Preguntas frecuentes nuevas: ¿Qué es Rouge Pass?, ¿Es una app de citas?, ¿En qué fiestas funciona?

### Cambiado
- Textos de la landing reescritos para buscadores sin perder el tono: H1 "App para fiestas y boliches" (el eslogan
  gigante queda igual, ahora con voseo: "Dominá la noche"), títulos y bajadas con las palabras clave, estados del
  pedido en castellano en vez de identificadores técnicos, menú con anclas reales y respuestas de las preguntas
  frecuentes siempre en el HTML.

### Agregado (v1.8 · privacidad, reuniones y /empresas)
- **Privacidad por contexto del Perfil principal:** `profiles` solo es legible por su dueño/a; los demás perfiles se
  leen como tarjetas saneadas (`profile_cards`: edad y no fecha de nacimiento, sin teléfono; @ y fotos solo si esa
  persona se mostró con su Perfil principal en un evento de noche compartido). Perfiles profesionales ajenos saneados
  (`persona_cards`: sin nombre interno, LinkedIn solo tras reunión o contacto aceptado). Columnas privadas de
  `event_attendees` (gasto, origen, RRPP, hora de ingreso, sectores) cerradas por tabla y en Realtime
  (`my_attendances`, `event_attendance`, `shared_zones`). El equipo ve solo los pines de rescate.
- **Ajustes de privacidad** (`privacy_settings`): incógnito por defecto, ubicación solo para el Squad, empresa y cargo
  solo después de una reunión. **Networking solo para acreditados** por evento (`networking_checkin_only`).
- **Reuniones 1 a 1** (`meetings`, `venue_spots`): Solicitar reunión / Punto de encuentro con motivo, horario, 15 o
  30 min y lugar (sala/mesa con cupo, pin en el plano o a definir), **Mis reuniones**, reprogramar, cancelar, chat al
  aceptar con la reunión fijada, marcadores en el plano y avisos en vivo. Panel de salas, mesas y puntos del evento.
- **Página `/empresas`** para vender ROUGE Pro, con estimador de planes y formulario conectado a `POST /api/leads`
  (`b2b_leads` + aviso al equipo comercial por `LEADS_WEBHOOK_URL`).
- Tests: motor de privacidad y reuniones, leads, contrato de los comandos nuevos, integración real y E2E `demo-pro.cjs`.

### Cambiado (v1.8)
- `Profile.birth_date` puede ser `null` (otras personas: solo `age`). Links a perfiles por @ o por id (`profileHref`).
- Modo Demo: versión 10 del estado (salas, reuniones y ajustes de privacidad sembrados).

### Agregado (v1.7)
- **ROUGE Pro: eventos corporativos dentro de la misma marca.** Cada evento es 🌙 Noche o 💼 Corporativo
  (`events.kind`, se elige al crearlo y no cambia una vez que entró gente). En corporativo: moods de negocio, grilla por
  **afinidad de negocio** (lo que cada uno busca cruzado con lo que el otro ofrece, más el rubro), filtro por lo que
  ofrecen, vocabulario propio (Networking, Contacto, Presentación, Equipo, Agenda, Barra y catering), menú y plano base
  de coffee y salas, CRM con empresa, cargo, rubro y busca/ofrece, y Pantalla LED con la agenda. Se apagan el trago de
  regalo, los pedidos al DJ, el sorteo por género y los RRPP.
- **Una cuenta, varios perfiles** (*Mis perfiles*): Perfil principal + hasta 5 perfiles profesionales o de noche. Al
  entrar a un evento se elige con cuál mostrarse; en corporativo es obligatorio un perfil profesional. En cada evento
  se ve solo esa cara (`faceOf`), y nunca la de la noche en un evento corporativo.
- Demo: el *Encuentro Pyme Conecta* en vivo junto a la fiesta, con perfiles profesionales y un CRM de empresas.
- SQL: enum `event_kind_t`, `events.kind`, moods `pro_*`, tabla `profile_personas` (RLS: solo visible para quien
  comparte un evento donde se usó), `event_attendees.persona_id`, `join_event(p_code, p_mood, p_persona)`,
  `delete_persona`, `mood_kind`, `business_affinity`, triggers `events_kind_locked`, `attendee_vertical` y
  `personas_limit`; `event_grid` devuelve la cara del evento; `not_in_vertical` en `send_icebreaker`, `vote_song`,
  `draw_raffle` y `ensure_promoter_link`.
- Documentación: [estrategia corporativa](docs/producto/estrategia-corporativa.md).

### Cambiado
- La afinidad (`AffinityResult`) devuelve `percent` y `highlights` (antes `musicPercent`): es musical en la noche y de
  negocio en corporativo.
- Modo Demo: nueva versión del estado (9). El menú de la barra sigue al evento activo, igual que en Supabase.

### Pendiente conocido
- Resuelto en v1.8: `profiles` ya no es legible por otros usuarios (privacidad por contexto).
- El límite de `/api/leads` es en memoria por instancia: con muchas instancias, sumarlo en el borde.

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

### Seguridad
- **Navegador:** CSP estricta con nonce por request (`src/proxy.ts`), HSTS, anti clickjacking, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` y COOP en todas las respuestas; reportes de violaciones en `/api/csp-report`.
  Las páginas pasan a renderizarse por request (necesario para el nonce).
- **Compresión de imágenes:** el worker carga la librería desde nuestro dominio (`public/vendor`, copiada en
  `predev`/`prebuild`) en vez de jsdelivr.
- **API de Instagram:** sin open redirect con `/\dominio`, origen fijo en producción, límite de pedidos, bodies acotados,
  timeouts, descargas solo de Meta (también tras redirecciones) y solo tipos de imagen, `no-store`; tokens cifrados con
  `INSTAGRAM_TOKEN_KEY`.
- **Base de datos:** helpers de permisos movidos al schema `private` (ya no se puede consultar quién bloqueó o hizo match
  con quién); privilegios por columna (squads, eventos, mensajes, entregas, sorteos); pines, pedidos y QRs solo por RPC;
  `anon` sin acceso a tablas ni RPCs salvo la vista previa de `/join`; fotos de chat legibles solo por quien ve el mensaje;
  mensajes con fotos solo del propio Storage; validación de Text Blasts (link seguro, largos, duración); códigos de Squad de
  10 hex; freno a la fuerza bruta de códigos (`too_many_attempts`) y al spam de conexiones (`slow_down`); `last_active_at`
  recortado a "ahora"; sin SVG en Storage.
- **API v1 (ticketeras):** origen fijo en producción para `join_url`/`qr_url` y el QR público cacheado (antes salía del
  header `Host`: se podía envenenar la caché con QRs a otro dominio), límite de pedidos por IP y por clave (`429
  rate_limited`), body acotado a 512 KB, cursor de paginación validado estrictamente, QR y OpenAPI embebibles desde
  otros orígenes (`Cross-Origin-Resource-Policy: cross-origin`). Las funciones nuevas de la v1.1.0 usan los helpers de
  `private`.
- **Tests:** `schema.security.test.ts` carga el `schema.sql` real en PGlite y ejecuta ~50 ataques en cada `npm test`;
  `security.test.ts` cubre CSP, redirecciones, links, límites y cifrado.

### Pendientes de seguridad conocidos
- `vitest` 3.x tiene avisos de seguridad (solo desarrollo, no llega a producción); el salto a 4.1.12 choca con un bug de
  npm 10 al resolver dependencias opcionales.
- Ver "Limitaciones conocidas" en `docs/tecnica/seguridad-y-privacidad.md` (datos de asistentes entre asistentes, acceso
  por slug, URLs firmadas de chat que vencen).

### Herramientas
- 14 skills de Claude Code en `.claude/skills/` (de `rampstackco/claude-skills`, MIT) para revisar código,
  seguridad, accesibilidad, rendimiento, QA, tests, diseño, formularios, onboarding, media, dependencias y
  monitoreo. Las reglas para usarlas en ROUGE están en `CLAUDE.md` → "Skills y pulido seguro".

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
