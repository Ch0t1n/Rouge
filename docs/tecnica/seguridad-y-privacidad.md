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
- **Claves:** la *service role key* solo vive en el servidor (`SUPABASE_SERVICE_ROLE_KEY`, nunca con prefijo `NEXT_PUBLIC_`).
- **Redirecciones internas:** los parámetros `next` se validan como rutas internas (sin open redirects).
- **Storage:** cada usuario escribe solo en su carpeta; los planos solo Dueño/a o Producción.

## Limitaciones conocidas (v1)

- **Fotos de chat:** el bucket `chat-media` es legible para cualquier usuario autenticado que tenga la URL. Las rutas
  incluyen UUID (no adivinables), pero no hay control por conversación. Mejora sugerida: URLs firmadas.
- **Fotos de perfil** son públicas por URL (necesario para mostrarlas rápido con mala señal).
- **Instagram:** solo cuentas profesionales; el @ escrito a mano no se verifica (se muestra como "sin verificar").
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
