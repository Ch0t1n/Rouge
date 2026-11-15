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
[15. PWA y mala señal](#15-pwa-y-mala-señal) · [16. Privacidad](#16-privacidad-y-reglas-que-no-se-negocian)

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
- **Códigos de 1 uso** para entregar con cada entrada (email, ticketera o impresos).
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

- **Menú del evento** (`/bar`) con precios siempre del servidor. Al crear un evento se copia el menú base; en la v1
  se ajusta desde Supabase (el editor de menú en el panel está pendiente).
- **Formas de entrega:** retiro rápido con QR (Fast-Pickup), delivery a tu pin o a la Mesa VIP (con Punto Base).
- **Vaquita del Squad:** divide el pedido entre integrantes.
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
| **Eventos y accesos** | Crear y editar eventos (horarios, lobby, cupo, plano subido, line-up), **link maestro con QR**, **códigos de 1 uso** (lotes, filtros, CSV, QR de cada código), **hoja imprimible de QRs** y **Equipo del evento**. |
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

`/` presenta ROUGE con capturas reales de la app: cómo funciona, seguridad, organizadores, tipos de usuario, QR y
llamado final ("Tengo una entrada" / "Organizar un evento"). Si ya hay sesión, ofrece "Mi pantalla".

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
