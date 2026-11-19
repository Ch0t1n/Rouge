# Demo comercial y Modo Demo

Cómo mostrarle ROUGE a dueños de boliches y productoras, a empresas y agencias de eventos corporativos, y cómo usar
el Modo Demo para redes.

## Qué es el Modo Demo

Si la app corre **sin** variables de Supabase, arranca sola en Modo Demo: una fiesta "en vivo"
(*ROUGE Night × Bresh Sábado*) con 13 asistentes, Squads, matches, pines, QRs, pedidos y el equipo completo.
Todo vive en el navegador de cada persona: no se rompe ni se ensucia aunque lo abran miles.

- Para publicarlo: un proyecto de Vercel **sin** variables de Supabase (ej. `demo.tudominio.com`). Ver
  [Puesta en producción](../operaciones/puesta-en-produccion.md#demo-pública).
- Las fechas son relativas a "ahora": la fiesta siempre está en vivo.
- *Reiniciar demo* (menú de persona) vuelve a los datos de fábrica.
- Login con Instagram y Google están **simulados** (feed de ejemplo incluido).

**Personas del demo**

| Tipo | Quién |
|---|---|
| Asistentes | Sofía (@sofi.noche), Camila, Julieta, Melina, Mateo, Lucas, Bruno, Joaquín, Valentina, Tomás, Nicolás, Francisca, Gonzalo |
| 👑 Dueña | Paula Ferrari |
| 🎛️ Producción | Luciano Paz |
| 🍸 Barra | Daniela Ortiz |
| 🛵 Mozo | Tomás Rey |
| 🛡️ Seguridad | Marta Gómez |

> **Limitación:** en Modo Demo el "tiempo real" funciona **entre pestañas del mismo navegador**, no entre dos
> teléfonos distintos. Para una demo con varios celulares reales hace falta un Supabase de staging.

## Armado de la demo presencial

Todo está en **`/demo`** del sitio de demostración (no en la pantalla principal, que queda para el público real):

- **Modo presentador** (`/demo/presentador`): en una notebook, el teléfono de Sofía y el panel de Paula lado a lado en
  una sola pantalla, sincronizados. Avanzá con ←/→ por el guion; cada paso pone la vista justa a cada lado y te
  recuerda qué decir. Cambiá el rol del panel (Dueña, Producción, Barra, Mozo, Seguridad) o pasá a la Pantalla LED.
- **Reiniciar** antes de cada reunión: la fiesta vuelve al estado inicial.
- Si hay TV o proyector: desde `/demo`, *Pantalla LED* abre en otra pestaña para mandarla por HDMI.
- Para dejarle el link al anfitrión: *Compartir* en `/demo` (link, WhatsApp o QR).

## Guion de 7 minutos

1. **El dolor del dueño (30 s).** Filas en la barra, gente que se va porque perdió al grupo, cero datos de quién vino.
2. **La puerta (45 s).** En el panel, *Eventos y accesos* → QR del link maestro. En el teléfono, entrar y elegir mood.
3. **Conectar (1 min).** Lobby por afinidad → Conectar → match → chat. Mostrar el Rompehielos con trago de regalo.
4. **Seguridad (1 min).** En el teléfono, Squad → 🚨 Rescate. En el panel, entrar como **Seguridad** (Marta): la
   alerta aparece con su ubicación en el plano.
5. **La plata (1 min 30 s).** El teléfono pide en la Barra Express. En el panel como **Barra** (Daniela) la comanda
   entra al Kanban → "Listo" → le llega el aviso al teléfono. Volver a **Resumen**: ventas por la app y filas evitadas.
6. **Fidelización (1 min).** Text Blast / Flash Promo a Squads de 4+ → llega al teléfono. Sorteo en vivo y ganador
   en la Pantalla LED. CRM exportable con Smart Tags.
7. **Cierre (1 min).** Propuesta de **primer evento gratis** a cambio de datos y un testimonio. Después: fee por
   evento, por asistente activo o comisión de barra/VIP.

## Demo para eventos corporativos

En `/demo` elegí **💼 Evento corporativo** ("¿A quién se la mostrás?"). La demo pasa a ser *Kickoff 2027 · Grupo
Vértice* (empresa ficticia), en vivo ahora, con la marca de la empresa (logo y azul) y las mismas personas con
perfil profesional:

| Persona | Rol en el kickoff |
|---|---|
| Sofía Benítez | Diseñadora UX Senior (la asistente del guion) |
| Camila Ríos | Product Manager, de su mismo equipo (segunda asistente) |
| Mateo Sosa | Data Scientist: ya es contacto de Sofía y tienen chat |
| Bruno Méndez | Founder de Kuarzo (startup invitada): le mandó un Rompehielos a Sofía |
| Lucas Ferreyra | Gerente Comercial de Nimbo Cloud (sponsor) |
| Francisca Luna | Talent Acquisition: "Estoy sumando gente" |
| 💼 Paula Ferrari | Organizadora (Personas y Cultura) |
| ☕ Daniela Ortiz | Catering / barra |
| 🛡️ Marta Gómez | Seguridad |

Agenda: acreditación, apertura, panel de IA, **networking guiado (en curso)**, premios y after office con DJ. Plano de
centro de convenciones (Plenario, Coffee & Bar, Zona Networking, Lounge Sponsors, Terraza). Menú de catering (café,
flat white, vino, empanadas…). Sin RRPP.

### Guion corporativo (7 minutos)

1. **El problema (30 s).** Cada uno se queda con su equipo, la agenda se pierde en WhatsApp y nadie mide qué funcionó.
2. **Acreditación (45 s).** El invitado entra con el link del mail y elige qué viene a buscar; en el panel, *Puerta*.
3. **Networking con criterio (1 min 15 s).** Grilla por áreas e intereses en común, cargo y empresa en cada tarjeta.
   Conectar → contacto. Aceptar el Rompehielos del founder invitado.
4. **La agenda y los avisos (1 min).** *Ver agenda* en el teléfono; Text Blast "arrancan los premios".
5. **Catering sin filas (1 min).** Pedir un café, retirarlo con QR; el panel (Catering) lo prepara.
6. **Cuidado en el after office (45 s).** Rescate → Seguridad lo ve en el plano.
7. **Datos y cierre (1 min 15 s).** CRM con empresa, cargo e intereses + CSV; sorteo del sponsor en la LED. Propuesta:
   primer evento sin costo a cambio de un caso de éxito.

**Lo que todavía no hay** (decirlo si lo preguntan): lista de invitados por CSV, credencial impresa, barra libre con
vouchers pagados por la empresa, encuestas y NPS, leads por sponsor, reporte final en PDF y factura A.

## Material para redes

- **Capturas reales:** `public/landing/*.webp` (se regeneran con `node scripts/capture-landing-shots.cjs`).
- **Pilares de contenido:** "Nunca más perdés a tu grupo" (seguridad) · "Conocé gente sin ser intenso" (afinidad y un
  solo Rompehielos) · "Barra sin filas" · para dueños: números y filas evitadas.
- **Formatos:** Reels/TikTok verticales tipo POV con grabación de pantalla del demo, carruseles con las capturas.
