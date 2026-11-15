# Demo comercial y Modo Demo

Cómo mostrarle ROUGE a dueños de boliches y productoras, y cómo usar el Modo Demo para redes.

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

## Material para redes

- **Capturas reales:** `public/landing/*.webp` (se regeneran con `node scripts/capture-landing-shots.cjs`).
- **Pilares de contenido:** "Nunca más perdés a tu grupo" (seguridad) · "Conocé gente sin ser intenso" (afinidad y un
  solo Rompehielos) · "Barra sin filas" · para dueños: números y filas evitadas.
- **Formatos:** Reels/TikTok verticales tipo POV con grabación de pantalla del demo, carruseles con las capturas.
