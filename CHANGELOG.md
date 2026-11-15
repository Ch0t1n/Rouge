# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

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
