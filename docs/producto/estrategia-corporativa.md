# Estrategia corporativa: ROUGE y ROUGE Pro (noviembre 2026)

Una sola marca y un solo producto para **fiestas y boliches** (ROUGE) y para **eventos corporativos, de pymes y de
networking** (ROUGE Pro). Este documento resume el debate, las decisiones tomadas, cómo quedó construido y cómo validar
el negocio con un primer evento de pymes.

## 1. El debate, en corto

**A favor de una sola marca:**

- La tesis se sostiene en los dos mundos. En la noche: "conecta rápido, no pierde a su grupo, consume sin filas y vuelve".
  En un evento de trabajo: networking útil, no perderse en el predio, café y catering sin fila, y el organizador que mide
  el resultado.
- Cerca del **70 % del valor operativo ya sirve tal cual**: marca por evento, códigos de 1 uso, API para sistemas de
  registro, escáner de puerta (acreditación), plano con pines, avisos, sorteos, Pantalla LED, CRM, roles, Rescate y
  "Llegué a casa".
- Hay **segmentos puente**: la fiesta de fin de año de la empresa, el after office y el congreso que cierra con fiesta.

**En contra (los riesgos que había que resolver):**

- "Match", las fotos y el loop asustan a RR. HH. y a Compliance.
- **El perfil único era el problema de fondo.** Si un empleado entraba al evento de su empresa con el perfil de la
  noche, se perdía al usuario y al cliente.
- El ciclo de venta y los requisitos son distintos: factura A, SSO, modo claro y acuerdo de tratamiento de datos.
- La competencia es otra (Swapcard, Brella, Grip, Bizzabo, Eventtia), y además está el riesgo de perder el foco.

**Síntesis:** el eje no es "empresa o boliche", es **modo social o modo profesional**. Hay un solo motor operativo y
caras que **no se cruzan nunca**.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Marca | **ROUGE Pro** es una submarca dentro de ROUGE. En cada evento manda la marca blanca del organizador. |
| Cuenta | **Una sola cuenta con varios perfiles.** Al entrar a un evento la persona elige con cuál se muestra. |
| Personalización | Los moods, los campos del perfil, el vocabulario y las funciones cambian según el tipo de evento (`events.kind`). |
| Validación | La primera prueba es un **encuentro de pymes** (ya hay contacto con uno). |

## 3. Cómo quedó construido (v1.7)

### 3.1 Tipo de evento: `events.kind` = `nightlife` | `corporate`

Todo lo que cambia entre las dos verticales vive en un solo archivo, `src/lib/engine/verticals.ts`:

| | Noche · ROUGE | Corporativo · ROUGE Pro |
|---|---|---|
| Moods | Voy con amigos, En la barra, Buscando after… | Haciendo networking, Busco clientes, Busco proveedores, Busco socios, Busco inversión, Estoy contratando, Vengo a aprender, En el coffee break |
| Perfil para entrar | El Perfil principal u otro perfil de noche | **Perfil profesional obligatorio** |
| Afinidad de la grilla | Musical (géneros en común) | **De negocio**: cruza lo que cada uno busca con lo que el otro ofrece, más el rubro |
| Filtros de la grilla | Géneros | Qué ofrecen |
| Vocabulario | Lobby, Match, Rompehielos, Squad, Line-up, Barra Express, Modo Solo Amigos | Networking, Contacto, Presentación, Equipo, Agenda, Barra y catering, Modo Solo Contactos |
| Se apagan | — | Trago de regalo, pedidos al DJ, sorteo por género, RRPP, edad, Instagram y loop en la cara pública |
| Menú y plano base | Tragos y botellas; pista, cabina, VIP | Café y catering; auditorio, stands, salas de reunión, coffee |
| Se mantienen | Todo | Plano y pines, Equipo con Rescate y Llegué a casa, barra con cobro, perks, sorteos, avisos, LED, CRM, puerta, API |

- El tipo se elige al crear el evento (*Eventos y accesos → Tipo de evento*). **No cambia una vez que entró alguien**:
  la regla está en el motor y en el trigger `events_kind_locked`.
- Cada regla existe en los dos lados, igual que el resto del producto: `checkMoodForEvent` ⇔ `mood_kind()` y el trigger
  `attendee_vertical`; `hasFeature` ⇔ `not_in_vertical` en `send_icebreaker`, `vote_song`, `draw_raffle` y
  `ensure_promoter_link`; `businessAffinity` ⇔ `business_affinity()`.

### 3.2 Perfiles múltiples: una cuenta, varias caras

- `profiles` sigue siendo la cuenta y su **Perfil principal** (el de la noche). Teléfono, bloqueos y lista negra son
  de la cuenta y valen en todos los perfiles.
- `profile_personas` guarda **hasta 5 perfiles adicionales** de cualquier tipo:
  - **Profesional:** nombre visible, foto propia, cargo, empresa, rubro, hasta 3 cosas que **busca** y 3 que
    **ofrece**, LinkedIn y una frase.
  - **De noche:** fotos, géneros y Spotify propios.
- Al entrar (`/join/<código>`) se elige el perfil y después el mood. En corporativo solo se ofrecen los perfiles
  profesionales; si la persona no tiene ninguno, se crea en el momento y vuelve al ingreso.
- En el lobby, "Te ven con: *Trabajo* · Cambiar" deja cambiarlo en cualquier momento.
- *Mi perfil → Mis perfiles* (`/profile/personas`) los lista y los edita. Un perfil no se puede borrar mientras se usa
  en un evento con el lobby abierto.

**Regla no negociable (`faceOf`):** en un evento se ve **solo la cara con la que la persona entró**:

- Grilla, perfil, bandeja, chats, plano, Equipo, CRM y LED pasan todos por `faceOf`.
- En corporativo **nunca** aparece el Perfil principal. Si el perfil profesional se borró, o es alguien del equipo sin
  perfil, se muestra una cara neutra: nombre, sin fotos ni bio.
- Cada contacto se ve con la cara del evento donde se conocieron: un match de la fiesta y un contacto del encuentro
  conviven en la misma bandeja, cada uno con su cara.
- **RLS:** un perfil adicional solo es legible para quien comparte con su dueño/a un evento donde se usó (como
  asistente o como equipo), y nunca si hay bloqueo. La grilla SQL (`event_grid`) también devuelve la cara del evento.

### 3.3 Para el organizador corporativo

- El **CRM** muestra empresa, cargo, rubro, qué busca y qué ofrece, y lo exporta en CSV. Es la base para el seguimiento
  comercial y para el paquete de sponsors.
- La **Pantalla LED** muestra contactos del evento, "Ahora" y "Sigue" de la agenda, el equipo más grande y el QR para
  "sumarse al networking".
- **RRPP** no aparece en el menú de un evento corporativo.

### 3.4 Demo

El Modo Demo trae **dos eventos en vivo a la vez**: la fiesta *ROUGE Night × Bresh Sábado* y el *Encuentro Pyme
Conecta* (`/join/PYME26`), con 10 perfiles profesionales. Algunos son las mismas cuentas de la noche con otra cara
(Sofía, Mateo, Melina, Tomás, Joaquín) y otros son emprendedores que solo usan ROUGE para trabajar.

Para mostrarlo:

1. Entrar a `/join/PYME26` como Sofía y elegir el perfil "Trabajo".
2. En Networking, Carla (Textil Norte) aparece primera porque busca justo lo que Sofía ofrece.
3. En la bandeja hay una Presentación fijada de Romina ("¿Café a las 17?").
4. Volver a `/join/BRESH26`: la misma Sofía aparece con su perfil de la noche y su match con Mateo sigue ahí.
5. Desde el panel (Dueña), elegir 💼 *Encuentro Pyme Conecta* para ver el CRM con empresas y la LED.

## 4. Plan de validación con el evento de pymes

**Objetivo:** demostrar en un evento real que ROUGE Pro genera conversaciones de negocio que no habrían pasado sin la
app, y que el organizador lo puede medir.

**Antes (2 semanas):**

1. Mostrar la demo al organizador con el guion de la sección 3.4, en 5 minutos.
2. Ofrecer el **primer evento sin cargo o a precio simbólico** a cambio de datos y un testimonio.
3. Cargar el evento como corporativo, con agenda, plano (auditorio, stands, salas) y el menú de coffee.
4. Mandar los códigos de 1 uso con la invitación. Abrir el networking **una semana antes**: el valor está en llegar
   con las reuniones ya armadas.

**Durante:** el QR en la LED y en la acreditación, una charla de 1 minuto al abrir ("abrí la app y mirá tus
recomendados") y la ronda de negocios armada por Equipos.

**Métricas de éxito (umbral para seguir invirtiendo):**

| Métrica | Umbral |
|---|---|
| Acreditados que crean su perfil profesional | ≥ 50 % |
| Contactos aceptados por asistente activo | ≥ 2 |
| Presentaciones enviadas que se aceptan | ≥ 40 % |
| Chats que siguen después del evento (lobby abierto 7 días) | ≥ 20 % de los contactos |
| El organizador vuelve a contratar, o lo recomienda a otra cámara o asociación | Sí |

**Hipótesis de precio para corporativo (a validar):** licencia por asistente acreditado o fee por evento. La comisión
de barra pesa poco, porque el catering suele estar incluido. Los ingresos extra posibles son el paquete para sponsors
(stands en el plano, avisos patrocinados, contactos con consentimiento) y el reporte post-evento.

## 5. Pendientes (por prioridad)

| # | Pendiente | Por qué | Esfuerzo |
|---|---|---|---|
| ~~1~~ | ✅ **v1.8 — Perfil principal privado por contexto.** `profiles` solo legible por su dueño/a; los demás ven tarjetas saneadas (`profile_cards`) y perfiles profesionales saneados (`persona_cards`). | — |
| ~~2~~ | ✅ **v1.8 — Reuniones 1 a 1 con sala, mesa o pin**, agenda "Mis reuniones", salas con cupo y chat al aceptar. | — |
| 3 | **Facturación ARCA (factura A)** | Las empresas la exigen para pagar. | M |
| ~~4~~ | ✅ **v1.9 — ROUGE PRO en `/pro`** (reemplaza a `/empresas`): identidad ejecutiva, ventajas separadas para organizadores y asistentes, simulador del panel y demo ejecutiva con leads (`/api/leads` → `b2b_leads` + webhook). | — |
| ~~4b~~ | ✅ **v1.10 — Ficha ejecutiva, pase con vCard y control multi-zona**: contacto por nivel de privacidad, categorías (SPEAKER, VIP, PRENSA, SPONSOR) y zonas con registro de lecturas. | — |
| 4c | **QR de acceso rotativo** (firmado por el servidor cada 30 s) | Evita capturas de pantalla compartidas en eventos con zonas pagas. | S–M |
| 5 | **Modo claro** para eventos corporativos | Más sobrio y mejor para salones con luz de día. | S–M |
| 6 | **Preguntas al orador** con votos (reusar los pedidos de temas) | Reemplaza "Pedir tema" en la Agenda. | S |
| 7 | **Login con Google Workspace / Microsoft** | SSO para empresas grandes. | M |
| 8 | Evento **híbrido** (jornada corporativa + fiesta de cierre en el mismo evento) | Es el segmento puente: congreso + fiesta. | M |
| 9 | Encuesta NPS y **reporte post-evento** para el organizador | Para medir el ROI y renovar el contrato. | S |
