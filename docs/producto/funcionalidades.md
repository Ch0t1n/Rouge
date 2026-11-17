# ROUGE v1.0 — Catálogo de funcionalidades

ROUGE es una **PWA social y operativa para eventos, fiestas y boliches**. El asistente entra al lobby privado
del evento, conecta con gente afín, arma su Squad, no pierde a su grupo y pide en la barra sin hacer fila. El
organizador opera toda la noche desde un panel y paga por evento, por asistente activo o con comisión de barra/VIP.

> **Tesis de producto:** ROUGE gana cuando la gente conecta rápido, no pierde a su grupo, consume sin filas y
> vuelve a comprar entrada. Ninguna función retiene a usuarios frustrados.

Cada función existe en los dos modos de la app:

| Modo | Para qué | Cómo se activa |
|---|---|---|
| **Demo** | Mostrar, vender y probar sin backend. Fiesta "en vivo" precargada, todo en el navegador. | Sin variables de Supabase. |
| **Supabase** | Producción: cuentas reales, datos con seguridad por fila (RLS), tiempo real y almacenamiento de fotos. | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |

Índice: [1. Acceso y cuentas](#1-acceso-y-cuentas) · [2. Perfil](#2-perfil) · [3. Ingreso al evento](#3-ingreso-al-evento) ·
[4. Lobby y conexiones](#4-lobby-y-conexiones) · [5. Squad y seguridad](#5-squad-y-seguridad) · [6. Plano](#6-plano) ·
[7. Chats](#7-chats) · [8. Barra Express](#8-barra-express) · [9. Perks, sorteos y avisos](#9-perks-sorteos-y-avisos) ·
[10. Música](#10-música) · [11. Panel del organizador](#11-panel-del-organizador) · [12. Roles del equipo](#12-roles-del-equipo) ·
[13. Compartir con QR](#13-compartir-con-qr) · [14. Landing pública](#14-landing-pública) ·
[15. PWA y mala señal](#15-pwa-y-mala-señal) · [16. Privacidad](#16-privacidad-y-reglas-que-no-se-negocian) · [17. API para ticketeras](#17-api-para-ticketeras-y-productoras) ·
[18. Demo en vivo](#18-demo-en-vivo-para-anfitriones) · [19. Marca y personalización](#19-marca-y-personalización) ·
[20. Cobros con Mercado Pago](#20-cobros-con-mercado-pago) · [21. Cuentas de la mesa](#21-cuentas-de-la-mesa) ·
[22. Gestión del evento](#22-gestión-del-evento) · [23. Ticket de comanda](#23-ticket-de-comanda) ·
[24. RRPP](#24-rrpp) · [25. Puerta](#25-puerta) · [26. Sitio público y de organizadores](#26-sitio-público-y-de-organizadores)

---

## 1. Acceso y cuentas

| Función | Detalle |
|---|---|
| **Login por tipo de usuario** (`/login`) | Dos pestañas: **Asistente** (entra a la app) y **Equipo** (entra al panel según su rol). |
| **Email con link mágico** | Sin contraseñas: llega un link al mail y se abre la sesión. |
| **Continuar con Google** | Proveedor nativo de Supabase. El onboarding toma el nombre de la cuenta de Google. |
| **Continuar con Instagram** | Crea la cuenta o entra a la existente. Sugiere el @username desde Instagram. Requiere cuenta profesional (Creador o Empresa). |
| **Destino según el rol** | Asistente → `/app` · Dueño/a, Producción y Seguridad → `/admin` · Barra y Mozo/a → `/admin/bar-pos`. Respeta el link al que la persona quería ir si su rol puede verlo. |
| **Cambiar de cuenta / rol** | Desde el panel ("Cambiar de cuenta") o el login. En demo se elige persona o rol sin email. |

## 2. Perfil

Un solo perfil que sirve para **todas las fiestas**.

- **Onboarding en 4 pasos** que guarda en cada paso: (1) nombre, @username, fecha de nacimiento (+18), género y
  teléfono; (2) hasta 4 fotos y un loop de 5 s; (3) géneros musicales y Spotify; (4) lista negra por teléfono.
- **Fotos:** hasta 4, formato 3:4, comprimidas en el teléfono a WebP antes de subir (avisa el ahorro: "2,1 MB → 240 KB").
  Se elige la principal y se reordenan.
- **Importar de Instagram:** con Instagram conectado se eligen fotos del feed; se descargan, se comprimen y se suben
  al almacenamiento de ROUGE (los links de Instagram vencen, nunca se guardan).
- **Loop de 5 s:** video tipo GIF, recodificado en el teléfono **sin audio**.
- **Música:** hasta 5 géneros (Techno, House, Reggaetón, Cachengue, Pop, RKT, Indie, Urbano, Electrónica) y un
  tema/playlist de Spotify (se pega el link; el reproductor solo carga al tocar "Escuchar").
- **Instagram en el perfil:** el @ con check **verificado** si la cuenta está conectada, o **sin verificar** si se
  escribió a mano. Se conecta y desconecta desde *Editar perfil*.
- **"Así te ven"** (`/profile`) con porcentaje de completitud y sugerencias. Compartir el perfil con QR.
- **Perfil de otra persona** (`/u/<username>`): afinidad musical, Conectar, Rompehielos, invitar al Squad, bloquear.

## 3. Ingreso al evento

- **Link maestro** (`/join/<slug>`) para redes y listas; respeta el cupo del evento en la app.
- **Códigos de 1 uso** para entregar con cada entrada (email, ticketera o impresos). Se pueden **anular** si la
  entrada se reembolsa: un código anulado deja de servir.
- **API para ticketeras:** el sistema de entradas genera un código por entrada y lo manda en el mail con su QR
  (ver [sección 17](#17-api-para-ticketeras-y-productoras)).
- **Link de Squad:** entra al evento y queda sumado al grupo de quien lo compartió.
- **Ingreso manual** (`/join`) escribiendo el código.
- **Vista previa** del evento antes de entrar (también sin sesión), y **Mood de la noche** al entrar:
  👯 Voy con amigos · 🧭 Perdí a mi grupo · 🍸 En la barra · ✨ Abierto a conocer gente · 💃 Solo vengo a bailar · 🌅 Buscando after.
- **Efecto Cenicienta:** el lobby abre y cierra en horarios configurables (ej. 48 h antes, 24 h después). Cerrado:
  sin grilla, plano, squads ni conexiones nuevas. **Los matches y chats 1:1 quedan para siempre.**

## 4. Lobby y conexiones

- **Grilla por afinidad** (`/lobby`): tarjetas 3:4 con % de afinidad musical, mood y última zona. Excluye a quien
  bloqueaste (o te bloqueó), a quien está en Modo Solo Amigos y a conexiones rechazadas.
- **Filtros:** géneros, moods y **"Coincidieron en tu zona"** (sectores donde ambos dejaron pin, sin guardar coordenadas).
- **Conectar:** pendiente hasta que la otra persona responda; si ya te había conectado, **match inmediato** con celebración.
- **Rompehielos ⚡:** **uno por evento**, máximo 140 caracteres, queda fijado arriba en la bandeja del otro. Se le puede
  adjuntar un **trago de regalo** (QR prepago, solo tragos individuales). Al aceptar, el texto es el primer mensaje
  del chat. El botón explica por qué está deshabilitado antes de que la persona escriba.
- **Solo recibir Rompehielos de gente que conecté** (opcional, por persona).
- **Modo Solo Amigos (Ghost Mode):** te oculta de la grilla; seguís visible para tu Squad y tus matches. Mientras está
  activo no podés enviar Conectar ni Rompehielos (sí aceptar). Plano, barra, perks y sorteos siguen andando.
- **Bandeja** (`/inbox`): Rompehielos arriba, solicitudes, enviadas y matches de todos los eventos.

## 5. Squad y seguridad

- **Crear o sumarse a un Squad** (`/squad`), invitar por link/QR, por @username o desde cualquier perfil.
- **🚨 Rescate en 1 toque:** clava un pin rojo compartido con el Squad, marca "necesito ayuda", manda alerta al chat
  del Squad y aparece en el panel de **Seguridad** del evento. Usa el pin activo, si no el Punto Base, y se puede
  precisar tocando el plano. Se confirma en pantalla sin tapar el botón "Ya estoy bien".
- **🏠 Llegué a casa:** borra los pines y avisa al grupo.
- **Punto Base 🚩:** lugar fijo de encuentro (bandera dorada) y aviso "nos vemos en 10 min".
- **Mesa VIP:** el Squad puede mostrar que tiene mesa y lugar para sumar otro grupo.
- **Perk grupal (QR Drop):** ej. "Squad de 4 antes de la 01:00 → trago de bienvenida para cada integrante".
- **Cuentas de la mesa** (`/squad/cuentas`): quién pagó qué y cuánto le transfiere cada uno al final. Ver [§21](#21-cuentas-de-la-mesa).

## 6. Plano

- **Plano interactivo** (`/map`) con zoom y paneo, sectores del lugar (o el plano subido por el organizador).
- **Pin-Drop de 15 minutos:** un pin activo por persona. Audiencia elegida a mano: tu Squad (cian) y/o matches
  seleccionados (rouge). **Nunca** se comparte con matches no elegidos.
- **Rescate** (`/map?rescue=1`) y **Punto Base** (`/map?mode=base`), y enfoque en una persona (`?focus=`).

## 7. Chats

- **Chat 1:1 entre matches** (`/chat/<id>`): texto y fotos comprimidas. Persiste después del evento.
- **Chat del Squad** (`/squad/chat`): texto, fotos y alertas del sistema (rescate, llegué a casa, Punto Base).
- Tiempo real: los mensajes llegan en vivo.

## 8. Barra Express

- **Menú del evento** (`/bar`) con precios siempre del servidor. El organizador lo edita en **Menú de la barra**; lo
  agotado se ve pero no se puede pedir.
- **Formas de entrega:** retiro rápido con QR (Fast-Pickup), delivery a tu pin o a la Mesa VIP (con Punto Base).
- **Compartido con el Squad (Vaquita):** elegís con quiénes lo comparten (todo el Squad o algunos, también una
  botella con delivery a la mesa). Lo paga quien pide y entra solo en las [cuentas de la mesa](#21-cuentas-de-la-mesa).
- **Cobro:** si la marca conectó Mercado Pago se paga desde la app antes de prepararse; si no, al retirar. Ver [§20](#20-cobros-con-mercado-pago).
- **Estado en vivo:** pendiente → en preparación → listo para retirar (o en camino) → entregado, con aviso al teléfono.
- **Código de retiro** generado por el servidor (corto o QR completo).

## 9. Perks, sorteos y avisos

- **Billetera de QRs** (`/perks`): tragos gratis, premios de sorteo, fast pass y tragos regalados. Brillo alto para
  escanear con poca luz.
- **QR Drops automáticos** por reglas del organizador (sin duplicados).
- **Sorteos en vivo:** el organizador sortea con filtros (todos, con pin activo, en Squad, público femenino); el
  ganador lo define el servidor y recibe su QR.
- **Text Blasts y Flash Promos:** avisos segmentados del organizador que llegan en vivo como banner.
- **Notificaciones en vivo:** avisos, rescates, pedido listo/en camino, QRs ganados, invitaciones, solicitudes y
  matches. Máximo 2 banners a la vista, nunca tapan acciones críticas.

## 10. Música

- **Line-up** del evento con "en cabina" y "sigue".
- **Pedir tema al DJ** y votar los temas de otros; los más votados aparecen en el panel y la Pantalla LED.

## 11. Panel del organizador

Vista expandida en desktop y pestañas en el celular (`/admin`).

| Sección | Qué hace |
|---|---|
| **Resumen** | ROI de la noche: ventas por la app, ticket promedio, asistentes y % del cupo, matches, squads, **filas evitadas**, perks canjeados, embudo (entraron → Squad → match → compraron), top consumo y temas más votados. |
| **Eventos y accesos** | Crear y editar eventos (horarios, lobby, cupo, plano subido, line-up), **link maestro con QR**, **códigos de 1 uso** (lotes, filtros, CSV con entrada/etiqueta/origen, QR de cada código, **anular**), **hoja imprimible de QRs**, **Equipo del evento** y **API para ticketeras** (claves). |
| **CRM** | Tabla completa con búsqueda, orden, **Smart Tags** (🏆 Top Spender, 👑 Squad Leader, 🔥 Power Matcher), WhatsApp directo y export CSV. |
| **Text Blasts** | Aviso o **Flash Promo** con vencimiento, segmentado por: todos, Squads de N+, sector, mood o top consumo. Alcance en vivo y vista previa. |
| **Perks y sorteos** | Reglas de QR Drop, **ruleta de sorteo en vivo** y validación de QRs. |
| **Barra / POS** | **Kanban de comandas** con minimapa de entrega y **ventanilla rápida** (código de retiro o QR de perk). |
| **Pantalla LED** | Pantalla gigante a pantalla completa por HDMI: métricas en vivo, matches de la última hora, line-up, temas y último ganador. Se adapta a cualquier proyector. |

## 12. Roles del equipo

El dueño/a suma gente por @usuario en **Eventos → Equipo del evento**. Cada rol ve solo sus secciones y el
**servidor** exige el permiso de cada acción (no es solo la interfaz).

| Rol | Entra a | Puede |
|---|---|---|
| 👑 **Dueño/a** (quien creó el evento) | Resumen | Todo, y es el único que arma el equipo. |
| 🎛️ **Producción** | Resumen | Todo el panel salvo el equipo. |
| 🍸 **Barra** | Comandas | Comandas, ventanilla (retiros y QRs de perk) y Pantalla LED. |
| 🛵 **Mozo/a** | Comandas | Comandas (delivery a pines y Mesas VIP). |
| 🛡️ **Seguridad** | Resumen | **Alertas de rescate en vivo** sobre el plano, conteos básicos y Pantalla LED. Sin ventas ni teléfonos. |
| ✨ **Asistente** | La app | Todo lo de las secciones 2 a 10. |

Quien no tiene permiso para una sección ve "Esta sección no es para tu rol" con un botón a su pantalla.

## 13. Compartir con QR

Todo link tiene su QR con **compartir nativo, WhatsApp, copiar y descargar PNG**: link maestro, cada código de 1 uso,
invitación al Squad, perfil e invitación al evento desde el inicio. `/admin/print-codes` imprime un QR por código libre.

## 14. Landing pública

`/` es una landing comercial 3D para asistentes (B2C) y organizadores (B2B), con scroll suave y una escena WebGL
procedural de fondo que cambia con cada sección (núcleo de cromo → anillos de conexiones → grilla holográfica del
plano con pines → cierre dorado/carmesí). Secciones:

1. **Hero** "No vayas a ciegas. Domina la noche." con CTAs *Tengo una entrada* (`/join`, o tu pantalla si ya entraste)
   y *Soy Organizador / Dueño de Club* (login de equipo → panel).
2. **Marquesina** doble que acelera y cambia de sentido con el scroll.
3. **Los 4 pilares** (lobby previo, Squads y seguridad, Pin-Drop 15 min, caducidad y privacidad) con un iPhone fijo
   que cambia de pantalla al bajar (en mobile, cada bloque trae su pantalla).
4. **"Tocá el club"**: plano miniatura interactivo con capas (Squad, Matches, Punto Base, mapa de calor de barras) y
   tarjetas en vivo por sector.
5. **Smart Bar & Perks**: tarjetas con inclinación 3D (Fast-Pickup QR, delivery al pin, Vaquita, QR Drops y sorteos).
6. **B2B**: comparación, pestañas del panel (CRM, Text Blast por zona, Pantalla LED) y **calculadora de ROI**
   (capacidad y precio del trago; supuestos visibles, estimación ilustrativa).
7. **Planes** (Event Pass, Club Pro, Festival/Enterprise) y preguntas frecuentes.
8. **Footer** monumental con reloj, accesos (tengo una entrada, entrar con mi cuenta, soy del equipo, organizar mi
   evento) y CTA.

La pantalla principal es para el público real: **no tiene nada de la demo** (ni atajos para entrar como un rol ni la
fiesta de ejemplo); eso vive en [`/demo`](#18-demo-en-vivo-para-anfitriones). En desktop hay cursor propio magnético; respeta
"reducir movimiento" (sin Lenis ni animaciones pesadas) y, si el dispositivo no tiene WebGL, queda el fondo CSS.

## 15. PWA y mala señal

- Se instala como app (sin tiendas). Abre en `/app`.
- Service Worker: estáticos en caché y página sin conexión (`/offline`).
- Imágenes comprimidas, placeholders con el color dominante, Spotify diferido y re-sincronización al volver a la app.
- Respeta "reducir movimiento" del sistema. Botones de al menos 44 px, pensados para una mano.

## 16. Privacidad y reglas que no se negocian

- **Bloqueo = invisibilidad mutua** (por perfil o por teléfono) en grilla, búsquedas, squads, plano y chat. Los
  mensajes nunca revelan que hay un bloqueo.
- **Lista negra por teléfono:** se puede bloquear un número antes de que esa persona tenga cuenta; nunca se revela
  si el número existe y se muestra enmascarado.
- **Teléfono privado:** ningún otro usuario lo ve; solo el CRM del dueño/a y producción del evento.
- **El staff no ve quién hizo match con quién:** sus métricas son conteos agregados.
- **Tokens de Instagram** solo en el servidor; desconectar los borra. Meta puede pedir el borrado por su callback.
- Ver el detalle técnico en [Seguridad y privacidad](../tecnica/seguridad-y-privacidad.md).

## 17. API para ticketeras y productoras

Para clientes empresariales que venden entradas con su propio sistema. Guía completa: [docs/api](../api/README.md).

- **Claves de API** desde *Eventos y accesos → API para ticketeras* (dueño/a o producción): para un evento o para
  todos los eventos de quien la crea. Se muestran una sola vez y se pueden revocar.
- **Un código por entrada** (`POST /api/v1/events/{evento}/codes` con `tickets[].external_ref`): idempotente, reintentar
  devuelve el mismo código. También por cantidad (cortesías).
- Cada código trae **`join_url`** (botón del mail) y **`qr_url`** (QR en PNG listo para el mail de la entrada).
- **Anular** códigos de entradas reembolsadas, **consultar estado** y **sincronizar check-ins** (`status=used&used_since`).
- Especificación **OpenAPI** en `/api/v1/openapi.json`. En el panel, los códigos emitidos por API muestran su número
  de entrada, etiqueta y la marca *API*.

## 18. Demo en vivo para anfitriones

Página separada para mostrarle ROUGE a dueños de boliches y productoras: **`/demo`** (se comparte por link o QR; no se
indexa en buscadores). Funciona en el sitio de demostración (Modo Demo); en el sitio con datos reales muestra un aviso
con link a `NEXT_PUBLIC_DEMO_URL`.

- **Guion de 7 minutos**: qué decir y qué tocar en cada paso, con un botón para abrir el teléfono y otro para abrir el
  panel con el rol justo (dueña, seguridad, barra…), sin contraseñas.
- **Abrir cualquier vista**: app de una asistente, una segunda asistente del mismo Squad, panel, barra, seguridad y
  Pantalla LED, cada una en su pestaña y ya con la persona correcta (`/demo/abrir?rol=…&a=…`).
- **Modo presentador** (`/demo/presentador`): el teléfono del asistente y el panel del equipo **lado a lado en una
  sola pantalla**, sincronizados en vivo (ej. el rescate tocado en el teléfono aparece al instante en Seguridad).
  Pasos con ←/→, cambio de rol del panel, Pantalla LED y **Reiniciar** la fiesta al estado inicial.
- Pensado para notebook (y TV por HDMI). La sincronización es entre pestañas del mismo navegador.

## 19. Marca y personalización

Cada productora, boliche o fiesta carga su identidad en **Marca y cobros** (`/admin/brand`) y la app de sus eventos se
ve con ella. Pensado para hacerse en dos minutos:

- **Logo** (PNG transparente o SVG; se comprime antes de subir) y **dos colores**: el principal (botones, matches,
  chat) y el de acento (barra, perks, Mesa VIP). Paletas sugeridas o cualquier color.
- **Vista previa en vivo** del teléfono del asistente mientras se eligen los colores.
- **Controles automáticos de legibilidad:** si un color no se lee sobre el fondo oscuro o con su texto encima, se explica
  el motivo antes de guardar (mismo control en el servidor). Tampoco se acepta un tono parecido al cian del Squad.
- **Seguridad sin marca:** el botón de **Rescate 🚨 siempre es rojo** y los pines del Squad siempre cian.
- **Por edición:** cada evento usa la marca de quien lo creó o personaliza su logo y colores solo para esa noche.
- **Dónde se ve:** inicio y toda la app del asistente, la invitación `/join` (también sin cuenta), la Pantalla LED y la
  hoja de QRs impresos. El panel del equipo mantiene los colores de ROUGE.
- Una persona puede tener varias marcas (por ejemplo, dos fiestas distintas).

## 20. Cobros con Mercado Pago

- La marca conecta **su** cuenta de Mercado Pago (autorización en Mercado Pago; ROUGE nunca ve la clave y los tokens
  se guardan cifrados). Se desconecta cuando quiera.
- Con la cuenta conectada, cada pedido de la Barra Express se **paga desde la app** (billetera de Mercado Pago, dinero
  en cuenta o tarjeta) y la plata entra directo a la cuenta de la marca.
- **Comisión de ROUGE automática:** Mercado Pago la separa en cada cobro (`marketplace_fee`), sin facturarla aparte.
- **La barra solo prepara lo que está pago:** los pedidos que esperan pago no aparecen en comandas; el panel muestra
  cuántos hay y cuánto se cobró por Mercado Pago. Cada comanda dice "Pagado con Mercado Pago" o "Cobrar al entregar".
- El pago lo confirma el servidor consultando a Mercado Pago (aviso firmado + verificación de monto y pedido), nunca
  el teléfono. Quien pidió puede reintentar el pago o cancelar el pedido mientras no esté pago.
- Sin cuenta conectada, todo sigue como antes: se paga al retirar.
- En el Modo Demo la conexión y el checkout se simulan. Configuración técnica: [Mercado Pago](../tecnica/mercadopago.md).

## 21. Cuentas de la mesa

Al cierre de la noche, cada Squad sabe quién le transfiere a quién (`/squad/cuentas`, también desde el inicio y el
Squad, y disponible después de que cierra el lobby):

- **Quién pagó qué:** los pedidos compartidos de la barra se suman solos; la mesa, las entradas o el taxi se cargan a
  mano (descripción, monto y entre quiénes, partes iguales al centavo).
- **Saldos** de cada integrante y las **transferencias mínimas** para quedar a mano (a lo sumo una menos que la
  cantidad de integrantes).
- **Alias para cobrar:** cada uno carga su alias o CBU/CVU; lo ven solo quienes comparten un Squad con esa persona y se
  copia con un toque.
- **"Ya le pagué"** (Mercado Pago, transferencia o efectivo) → quien recibe confirma ("Recibido") o lo rechaza
  ("No me llegó"). Aviso en vivo.

## 22. Gestión del evento

Todo lo del evento lo maneja su organizador desde el panel:

- **Datos, lobby, plano, line-up, accesos, equipo y API** (*Eventos y accesos*), **marca y cobros**, **perks y
  sorteos**, **avisos**, **comandas** y **CRM**.
- **Menú de la barra** (`/admin/menu`): agregar, editar nombre, emoji, categoría y precio, marcar **Agotado** en un
  toque y sacar ítems. Los pedidos ya hechos conservan su nombre y precio.
- **Nueva edición**: duplica el evento para otra fecha (marca, colores, plano, cupo, line-up, menú y reglas de perks,
  todo corrido a la nueva fecha) con link y código maestro nuevos.
- **Expulsar** a alguien desde el CRM: sale del lobby, de su Squad de esa noche y del plano. Opcionalmente queda
  **bloqueado** para volver a entrar a ese evento (con cualquier código); se puede revertir. Su perfil, matches y chats
  no se tocan. Al equipo no se lo expulsa (primero se lo saca del equipo).
- **Eliminar** un evento creado por error o de prueba: solo quien lo creó, escribiendo su link para confirmar, y solo
  si todavía no entró nadie (un evento real conserva su historial y sus cobros).

## 23. Ticket de comanda

Cada comanda de **Barra / POS** tiene un botón 🖨️ que abre su ticket para impresora térmica de 80 mm (también sale
en A4): marca y evento, número de comanda, fecha, cliente, entrega, código grande y QR de retiro, ítems, total y si
está **pagado con Mercado Pago** (con número de operación) o **a cobrar**. Se imprime solo y tiene copia para el
cliente y para la barra. Es un comprobante interno: la factura la emite cada comercio.

## 24. RRPP

- **Tipo de usuario 📣 RRPP**: el dueño/a lo suma al equipo por @usuario con ese rol. Entra al panel y solo ve su
  sección (`/admin/rrpp`).
- **Link y QR propios** por evento (`/join/RP…`), para historias, WhatsApp o impresos. Quien entra por ese link queda
  a nombre del RRPP (si ya estaba en el evento, no cambia).
- **Sus números, sin datos personales:** cuántos entraron por su link, cuántos pasaron por la puerta y cuánto tiene
  para cobrar. No ve nombres, teléfonos, consumos, pines, squads ni el CRM.
- **Dueño/a y producción:** ranking de RRPP, generan links, fijan la **comisión por ingreso** y exportan la
  **liquidación** en CSV. Si el evento usa el escáner de la puerta, se paga por ingreso confirmado (no por
  registrarse en la app).

## 25. Puerta

- **Escáner** (`/admin/door`) para dueño/a, producción y seguridad, pensado para el celular: usa la cámara (o el código
  tipeado o un lector).
- Valida la **entrada** (QR del código de 1 uso, del mail o impreso) y el **pase de la app** (*Inicio → Mi entrada*).
- Responde al instante: **Adelante** (verde), **Ya entró** a tal hora (amarillo) o el motivo del rechazo (rojo):
  anulada, expulsado/a, de otro evento, link general o inexistente.
- Muestra **foto, nombre y edad** para comparar con quien entra (marca "MENOR" si corresponde).
- Contador de gente adentro y cupo. El ingreso confirmado se usa para liquidar a los RRPP.
- La **ventanilla de la barra** también escanea con la cámara (QR de retiro y de perks).

## 26. Sitio público y de organizadores

- **`/`** — para el público: qué ganás (entrada en el celular, conectar, Squad, rescate, barra sin fila, tragos y
  premios, cuentas claras, privacidad) y preguntas frecuentes. Sin nada de CRM, ventas ni planes; solo un acceso
  discreto para el equipo.
- **`/organizadores`** — para dueños de boliches y productoras: barra y cobros, panel, CRM, Text Blasts, LED, RRPP,
  puerta, planes y preguntas de negocio. **Oculto:** no aparece en buscadores ni se enlaza desde `/`; se comparte por
  link junto con la [demo](#18-demo-en-vivo-para-anfitriones).

## 27. Experiencia en PC, notebook y tablet

- Móvil (< 768px): la app de siempre, una mano, barra inferior y hojas inferiores.
- Tablet (≥ 768px): sidebar de íconos con los mismos indicadores en vivo. PC (≥ 1024px): sidebar expandible
  (Ctrl/⌘ + B), selector de evento y acceso al perfil; los modales pasan a diálogos centrados.
- Lobby con 3–5 columnas, buscador y vista previa del perfil en panel derecho; bandeja y chat en vista dividida;
  barra con el pedido fijo a la derecha; perks con QR y avisos al costado; Squad en tres columnas (plano, integrantes,
  chat/cuentas); plano grande con la lista de pines visibles.
- Panel del organizador con cabeceras y encabezados de tabla fijos y atajos de teclado (Alt + 1…9, /, ?).

## 28. Plataformas separadas y staff seguro

- Cuatro superficies: app del asistente, operación (`/ops/door`, `/ops/bar`), panel del organizador (`/admin`) y
  consola global (`/superadmin`). Puerta y Barra en turno solo ven `/ops`.
- El dueño/a invita staff con un link o QR de 1 uso (2 h), elige rol, alcance (todos sus eventos o algunos) y ventana
  horaria automática (2 h antes → 1 h después). Revoca a cualquiera al instante (kill switch).
- Modo Kiosco: una tablet fija en la barra o la puerta; cada integrante opera con su PIN y la auditoría registra quién
  entregó o escaneó qué. Auditoría inmutable exportable a CSV.
- Asistentes: "Reportar" con bloqueo opcional (llega en vivo a seguridad), borrado real de la cuenta, +18 y términos al
  registrarse, Botón de arrepentimiento. Opción de lobby solo para quienes ya ingresaron por la puerta.

## 29. QR anti-fraude y puerta a prueba de cortes

- Pase, perks y vouchers con QR que cambia cada 20 s (anillo "EN VIVO"): una captura de pantalla no sirve.
- Doble escaneo simultáneo: entra el primero; el segundo ve en rojo la hora y la terminal que ya lo usó.
- Listas Free con hora límite: después de esa hora la puerta muestra el diferencial y lo cobra en el momento.
- Sin Wi-Fi: la puerta sigue validando con un padrón cifrado en el dispositivo y sincroniza al volver la red.
  Búsqueda manual por nombre, DNI o email.

## 30. Consola global y herramientas B2B

- `/superadmin` (equipo de ROUGE): todos los boliches en vivo, búsqueda de asistentes con acciones rápidas y la matriz
  de staff de cada organización con baja remota.
- RRPP con comisión escalonada por tramos y % sobre la barra de sus invitados; liquidación exportable.
- Tablero minuto a minuto: ingresos y ventas cada 15' contra el promedio de las fechas anteriores.
- Campañas por WhatsApp sin API paga: segmento + plantilla → bandeja con un botón por persona y estado Contactado.

## 31. Monetización y post-fiesta

- Invitar un trago desde el chat o al hacer match (QR en vivo para retirar).
- Mesa VIP dividida entre el Squad: cada uno paga su parte; al 100 % se libera el QR de la mesa.
- Cola virtual de la barra con aviso cuando el pedido está listo.
- Rouge Wrapped: la noche en una tarjeta 9:16 para Stories.

