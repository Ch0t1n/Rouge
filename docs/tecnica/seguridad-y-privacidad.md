# Seguridad y privacidad

ROUGE maneja datos sensibles de gente de noche: teléfono, edad, fotos, ubicación aproximada y con quién conecta.
Este documento resume qué se guarda, quién lo ve y cómo se protege.

## Principios

1. **El servidor decide.** Toda regla de negocio y todo permiso se valida en Postgres (RLS + RPCs `security definer`),
   no solo en la interfaz. El cliente aplica las mismas reglas solo para responder al instante.
2. **Mínimo necesario.** Ubicación solo en pines de 15 minutos y solo para quien el usuario elige; del recorrido solo
   se guarda el nombre de los sectores (para el filtro "coincidieron en tu zona"), nunca coordenadas históricas.
3. **Nunca revelar un bloqueo.** Un perfil bloqueado o inexistente se ve igual: "Este perfil no está disponible".

## Qué ve cada uno

| Dato | El propio usuario | Otros asistentes | Barra / Mozo / Seguridad | Dueño/a y Producción |
|---|---|---|---|---|
| Nombre, @, fotos, bio, música, Instagram | ✔ | ✔ (salvo bloqueo) | ✔ | ✔ |
| Teléfono | ✔ | ✘ (privilegios por columna) | ✘ | ✔ vía `event_crm` |
| Pin en el plano | ✔ | Solo su Squad y los matches que eligió | Todos los del evento | Todos los del evento |
| Con quién hizo match | ✔ | Solo la otra persona | ✘ (solo conteos) | ✘ (solo conteos) |
| Chats | ✔ | Solo los participantes | ✘ | ✘ |
| Pedidos | Propios y de su Vaquita | ✘ | ✔ del evento | ✔ del evento |
| Lista negra | ✔ | ✘ | ✘ | ✘ |
| Token de Instagram | ✘ (ni el propio) | ✘ | ✘ | ✘ (solo el servidor) |

## Controles implementados

- **Row Level Security** en todas las tablas; políticas por rol con `has_staff_role`, `is_event_manager` y `can_operate_bar`.
  Esos helpers viven en el schema `private`, que la API no expone: nadie puede preguntarle a la base "¿A bloqueó a B?" o
  "¿A hizo match con B?" con ids ajenos.
- **Escrituras acotadas:** privilegios por columna y por tabla. Pines, pedidos de barra, QRs, avance de comandas, ganadores
  de sorteos y entregas de blasts solo cambian por RPC; `created_at`, dueños y totales no se pueden falsificar. `anon` no
  toca ninguna tabla (salvo columnas públicas de `events`) ni ejecuta RPCs (salvo `resolve_access_code`).
- **Anti fuerza bruta y anti spam en el servidor:** códigos de Squad de 10 hex (1 billón de combinaciones); 20 códigos
  inválidos en 15 min por usuario o IP bloquean el ingreso un rato; tope de solicitudes de conexión por minuto.
- **Mensajes:** solo texto o foto; la foto tiene que estar en `chat-media/<id del que envía>/` (no se aceptan URLs externas
  que funcionen como píxel de rastreo de la IP del otro). Las alertas del sistema solo las generan las RPCs.
- **Privilegios por columna** en `profiles`: el teléfono y `instagram_verified` no son legibles/escribibles por clientes.
- **Bloqueos:** `is_blocked()` se aplica en grilla, perfiles, squads, pines y mensajes, por perfil y por teléfono normalizado E.164.
- **Códigos ocultos:** los códigos de 1 uso y los squads ajenos no son legibles; la vista previa sale de `resolve_access_code`.
- **Generación en servidor:** códigos de Squad, de retiro y de 1 uso, ganador de sorteos y precios del menú se
  calculan en Postgres; el cliente nunca los inventa.
- **Instagram:**
  - `state` OAuth firmado con HMAC-SHA256 y atado a una cookie httpOnly (anti-CSRF), vence en 10 minutos;
  - tokens solo en `instagram_accounts` (RLS sin políticas, sin privilegios para clientes), renovación automática;
  - las fotos se descargan solo desde hosts de Meta (no es un proxy abierto) y se re-suben a nuestro Storage;
  - el token de sesión del login viaja en el **fragmento** de la URL (no llega a servidores ni logs) y se borra del historial;
  - callback de desautorización / borrado de datos con `signed_request` verificado (`/api/instagram/data-deletion`).
- **API para ticketeras:** claves guardadas solo como SHA-256 (se muestran una vez), revocables, con alcance por evento
  y que pierden acceso si quien las creó sale del equipo. Las funciones `api_*` solo las ejecuta el servidor. El QR
  público no consulta la base (no revela si un código existe). Los códigos tienen ≈ 2^50 combinaciones.
- **Claves:** la *service role key* solo vive en el servidor (`SUPABASE_SERVICE_ROLE_KEY`, nunca con prefijo `NEXT_PUBLIC_`).
- **Redirecciones internas:** los parámetros `next` se validan como rutas internas (sin open redirects).
- **Storage:** cada usuario escribe solo en su carpeta; los planos solo Dueño/a o Producción. Las fotos de chat las ve solo
  quien puede ver el mensaje (ya no cualquier usuario con sesión). Sin SVG en ningún bucket.
- **Navegador:** CSP estricta con nonce por request (`src/proxy.ts`): solo corren los scripts de la app; red, imágenes e
  iframes limitados a Supabase, los CDNs de Meta (miniaturas al importar) y Spotify. Además HSTS, `X-Frame-Options: DENY` /
  `frame-ancestors 'none'` (anti clickjacking), `nosniff`, `Referrer-Policy`, `Permissions-Policy` (sin cámara, micrófono
  ni GPS) y COOP. Las violaciones se reportan a `/api/csp-report` (logs). El worker de compresión de imágenes se sirve desde
  nuestro dominio (antes bajaba código de jsdelivr). El iframe de Spotify va con `sandbox`.
- **API (`/api/*`):** `no-store`, límite de pedidos por IP y por usuario (en memoria, por instancia), bodies acotados,
  timeouts a Meta, descargas de fotos solo de hosts de Meta también tras redirecciones y solo JPEG/PNG/WebP/HEIC, origen
  público fijo (`NEXT_PUBLIC_APP_URL`, nunca el header `Host`), redirecciones internas que rechazan `/\evil.com`.
- **API v1 (ticketeras):** claves guardadas como SHA-256, funciones `api_*` solo para el servidor, límite de pedidos por IP
  y por clave, body acotado, cursor validado y links/QRs siempre con `NEXT_PUBLIC_APP_URL` (nunca con el header `Host`).
- **Tokens de Instagram cifrados** en la base con AES-256-GCM si está `INSTAGRAM_TOKEN_KEY`.
- **Links de Text Blasts:** solo rutas de ROUGE o `https://` (validado en el motor, en `send_blast` y al mostrarlos).

## Limitaciones conocidas (v1)

- **Fotos de chat:** se muestran con URLs firmadas que vencen a los 7 días; después la foto deja de verse aunque el chat
  quede. Mejora sugerida: firmar al mostrar (la política de lectura ya lo permite a los participantes).
- **Datos de asistentes entre asistentes:** cualquier asistente del evento puede leer de los demás `total_spent`,
  `visited_sectors` (zonas donde dejaron pin) y `joined_via`, porque la grilla se calcula en el cliente. Mejora sugerida:
  que el cliente use la RPC `event_grid` (ya devuelve solo las zonas en común) y quitar esas columnas a `authenticated`.
- **Acceso por slug:** `join_event` acepta el slug del evento, que es público; en la práctica cualquiera con sesión que lo
  conozca puede entrar al lobby (los códigos de 1 uso solo saltean el cupo). Si un evento tiene que ser realmente privado,
  hay que dejar de aceptar el slug para entrar.
- **Límite de pedidos de la API:** en memoria por instancia (serverless): frena ráfagas, no un ataque distribuido. Para
  eso, una regla en Vercel Firewall.
- **CSP:** `style-src` permite estilos inline (React los usa en atributos `style`); los scripts sí son estrictos.
- **Fotos de perfil** son públicas por URL (necesario para mostrarlas rápido con mala señal).
- **Instagram:** solo cuentas profesionales; el @ escrito a mano no se verifica (se muestra como "sin verificar").
- **API sin límite de frecuencia propio:** hay topes por request (1000 códigos, 500 por página); un rate limit por clave
  (ej. en el borde/CDN) es una mejora recomendada antes de abrirla a muchos clientes.
- **Moderación:** no hay reportes de contenido ni moderación de fotos en la v1 (solo bloqueo).
- **Verificación de edad:** es declarativa (fecha de nacimiento +18).

## Cumplimiento (Argentina)

> Esto no es asesoramiento legal: revisarlo con un abogado antes de abrir al público.

- **Ley 25.326 de Protección de Datos Personales:** inscripción de la base de datos ante la AAIP, política de
  privacidad publicada, consentimiento informado (el login ya avisa que el organizador ve nombre, edad y teléfono) y
  derechos de acceso, rectificación y supresión.
- **Meta (Instagram):** política de privacidad pública, URL de borrado de datos y App Review.
- **Google:** pantalla de consentimiento OAuth verificada (nombre, logo, dominios y política de privacidad).
- **Borrado de cuenta:** en la v1 se hace a pedido (borrar el usuario en Supabase Auth elimina en cascada perfil,
  conexiones, mensajes propios y tokens). Un botón de autoservicio es una mejora recomendada.
