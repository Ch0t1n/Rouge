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
| Perfil principal (@, fotos, bio, música, Instagram, **edad**) | ✔ | **[v1.8]** Solo si comparten un evento de noche donde se mostró con él (`profile_cards` nivel "full"); si no, solo el nombre o nada | Nombre (y el perfil del evento) | ✔ en su evento |
| Fecha de nacimiento | ✔ | ✘ (solo la edad, calculada en el servidor) | ✘ | ✘ (edad en el CRM) |
| Teléfono / email | ✔ | ✘ (privilegios por columna; el email vive en Auth) | ✘ | Teléfono vía `event_crm` |
| Perfil profesional (cargo, empresa, LinkedIn) | ✔ | Si comparten el evento (`persona_cards`): LinkedIn solo tras reunión o contacto aceptado; empresa y cargo ocultos si lo eligió | Solo lo que ven los asistentes | ✔ completo (CRM) |
| **[v1.10]** Email y teléfono de contacto de la ficha ejecutiva | ✔ | `strict`: solo tras reunión o contacto aceptado; `network`/`public`: asistentes de ese evento | Solo con `public` | Solo con `public` |
| **[v1.10]** Categoría (tier) y registro de zonas | ✔ su categoría | Ven la categoría (badge) | Seguridad: registro de lecturas | ✔ (cambian la categoría) |
| Gasto, cómo entró, RRPP, hora de ingreso, sectores visitados | ✔ (`my_attendances`) | ✘ (solo "acreditado sí/no" y las zonas en común) | Seguridad: hora de ingreso | ✔ (`event_attendance`) |
| Pin en el plano | ✔ | Solo su Squad y los matches que eligió (o solo el Squad, si lo configuró) | **[v1.8]** Solo alertas de rescate | Solo alertas de rescate (conteo en `event_stats`) |
| Reuniones | ✔ | Solo la otra persona | ✘ (solo conteos) | ✘ (solo conteos) |
| Con quién hizo match | ✔ | Solo la otra persona | ✘ (solo conteos) | ✘ (solo conteos) |
| Chats | ✔ | Solo los participantes | ✘ | ✘ |
| Pedidos | Propios y los compartidos con él/ella | ✘ | ✔ del evento | ✔ del evento |
| Cuentas de la mesa (gastos, transferencias) | ✔ de su Squad | Solo su Squad | ✘ | ✘ |
| Alias / CBU para cobrar | ✔ | Solo quienes comparten un Squad | ✘ | ✘ |
| Tokens de Mercado Pago de la marca | ✘ | ✘ | ✘ | ✘ (solo el servidor, cifrados) |
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
- **API para ticketeras:** claves guardadas solo como SHA-256 (se muestran una vez), revocables, con alcance por evento
  y que pierden acceso si quien las creó sale del equipo. Las funciones `api_*` solo las ejecuta el servidor. El QR
  público no consulta la base (no revela si un código existe). Los códigos tienen ≈ 2^50 combinaciones.
- **Mercado Pago (cobros de la marca):**
  - OAuth con `state` firmado (HMAC) + cookie httpOnly, solo para quien creó la marca;
  - tokens del vendedor **cifrados con AES-256-GCM** (`MP_TOKEN_KEY`) en `brand_payment_accounts` (sin acceso de clientes);
  - el pago lo acredita SOLO el servidor (`confirm_order_payment`, service role) después de consultar el pago a la API
    de Mercado Pago con el token de esa marca: estado aprobado, `external_reference` = pedido de un evento de esa marca,
    monto y moneda exactos. El webhook exige la firma `x-signature` (`MP_WEBHOOK_SECRET`) y nunca confía en el cuerpo;
  - `payments_enabled` y el estado de pago de los pedidos no son escribibles por clientes (privilegios por columna);
    la barra no puede marcar un pedido como pagado.
- **RRPP:** no es "staff" para ver datos (`is_event_staff` lo excluye): sus números salen de `promoter_stats`
  (conteos, sin personas). Su link se resuelve en el servidor como el link maestro.
- **Puerta:** `door_check_in` solo para dueño/a, producción y seguridad; devuelve nombre, foto y edad de quien entra
  para verificar identidad y +18.
- **[v1.10] Zonas y vCard:** `zone_check_in` (mismos roles) valida la categoría por zona y registra cada lectura; el
  registro no lo ve ningún asistente y no se escribe por tabla. En corporativo devuelve la cara profesional, nunca la de
  la noche ni la edad. La categoría la escribe solo la organización (`set_attendee_tier`) o el código de la entrada. La
  vCard se arma en el cliente con la ficha ya saneada por `persona_cards`: nunca incluye datos que quien la guarda no
  podía ver; en la propia, la persona elige si incluye email y teléfono.
- **Cuentas de la mesa:** gastos y transferencias visibles solo para integrantes del Squad; el alias o CBU/CVU para
  cobrar lo ven solo quienes comparten un Squad con esa persona.
- **Marca:** los colores pasan el mismo control de contraste en el motor y en Postgres; el rescate y el Squad no se
  pueden recolorear. Un evento solo usa marcas de quien lo creó (trigger).
- **Claves:** la *service role key* solo vive en el servidor (`SUPABASE_SERVICE_ROLE_KEY`, nunca con prefijo `NEXT_PUBLIC_`).
- **Redirecciones internas:** los parámetros `next` se validan como rutas internas (sin open redirects).
- **Storage:** cada usuario escribe solo en su carpeta; los planos solo Dueño/a o Producción.

## Limitaciones conocidas (v1)

- **Fotos de chat:** el bucket `chat-media` es legible para cualquier usuario autenticado que tenga la URL. Las rutas
  incluyen UUID (no adivinables), pero no hay control por conversación. Mejora sugerida: URLs firmadas.
- **Fotos de perfil** son públicas por URL (necesario para mostrarlas rápido con mala señal).
- **Instagram:** solo cuentas profesionales; el @ escrito a mano no se verifica (se muestra como "sin verificar").
- **API sin límite de frecuencia propio:** hay topes por request (1000 códigos, 500 por página); un rate limit por clave
  (ej. en el borde/CDN) es una mejora recomendada antes de abrirla a muchos clientes.
- **Moderación:** no hay reportes de contenido ni moderación de fotos en la v1 (solo bloqueo).
- **Verificación de edad:** es declarativa (fecha de nacimiento +18).
- **Rate limit de /api/leads** en memoria por instancia (5 cada 10 min por IP): en un despliegue con muchas instancias
  conviene sumarlo en el borde (CDN / WAF).

## Cumplimiento (Argentina)

> Esto no es asesoramiento legal: revisarlo con un abogado antes de abrir al público.

- **Ley 25.326 de Protección de Datos Personales:** inscripción de la base de datos ante la AAIP, política de
  privacidad publicada, consentimiento informado (el login ya avisa que el organizador ve nombre, edad y teléfono) y
  derechos de acceso, rectificación y supresión.
- **Meta (Instagram):** política de privacidad pública, URL de borrado de datos y App Review.
- **Google:** pantalla de consentimiento OAuth verificada (nombre, logo, dominios y política de privacidad).
- **Borrado de cuenta:** en la v1 se hace a pedido (borrar el usuario en Supabase Auth elimina en cascada perfil,
  conexiones, mensajes propios y tokens). Un botón de autoservicio es una mejora recomendada.
