# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

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
