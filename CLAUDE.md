# ROUGE — Guía de arquitectura para Claude Code

ROUGE es una **PWA social y operativa para eventos, fiestas y discotecas (B2B2C)**.
Los asistentes entran a un lobby privado del evento (link maestro o código de 1 uso),
conectan con gente afín, arman su **Squad** (seguridad grupal + perks), se ubican en el
**plano** con pines de 15 min y piden en la **Barra Express**. El organizador paga
(fee por evento / por asistente activo / comisión de barra-VIP) y opera todo desde `/admin`.

> **Tesis:** ROUGE gana cuando la gente conecta rápido, no pierde a su grupo, consume sin
> filas y vuelve a comprar entrada. Nunca diseñar features que retengan usuarios frustrados.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript estricto, Turbopack) · React 19 |
| Estilos | Tailwind CSS 3.4 (`tailwind.config.ts`) + `tailwindcss-animate`, componentes estilo shadcn en `src/components/ui` |
| Íconos | `lucide-react` |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) — `supabase/schema.sql` |
| Media | `browser-image-compression` → WebP en cliente antes de subir (`src/lib/media/compress.ts`) |
| Tests | Vitest (`src/**/*.test.ts`) |

## Comandos

```bash
npm run dev        # servidor de desarrollo (http://localhost:3000)
npm run build      # build de producción (verifica tipos)
npm run typecheck  # tsc --noEmit
npm test           # tests del motor de reglas
node scripts/generate-icons.cjs        # re-rasteriza íconos PWA desde public/icons/icon.svg
node scripts/generate-demo-avatars.mjs # regenera avatares SVG del demo
```

## Estructura

```
src/
  app/                    # Rutas (App Router)
    layout.tsx            # Fuentes, metadata PWA, RougeProvider, AppShell
    page.tsx              # Home del evento (Modo Demo hub)
    admin/                # Suite del organizador (vista EXPANDIDA en desktop)
    offline/              # Fallback del Service Worker
  components/
    ui/                   # Primitivas: Button, Badge, Switch, BottomSheet, Avatar, Toaster
    layout/               # AppShell (contenedor móvil vs. admin), PersonaSwitcher, SW register
    venue/VenueMap.tsx    # Plano interactivo (zoom/paneo, sectores, pines)
    event/                # LineupBanner, etc.
  lib/
    types.ts              # Tipos de dominio — ESPEJO 1:1 de supabase/schema.sql
    engine/
      selectors.ts        # Reglas de VISIBILIDAD (bloqueos, ghost, pines, lobby)
      actions.ts          # Reglas de NEGOCIO puras (state, input, now) → Result
      affinity.ts         # Algoritmo de afinidad
      analytics.ts        # Métricas B2B, CRM, Smart Tags
      engine.test.ts      # Tests de invariantes de negocio
    mock/seed.ts          # Motor de Mock Data (fechas relativas a "ahora")
    store/RougeContext.tsx# Estado global + persistencia localStorage + sync entre pestañas
    supabase/client.ts    # Cliente Supabase (null si no hay credenciales)
    media/compress.ts     # Compresión de imágenes / validación de video loop
supabase/schema.sql       # Tablas, índices, RLS, RPCs, triggers, realtime, storage
public/                   # manifest.json, sw.js, íconos, avatares demo
```

## Principios de arquitectura

1. **Motor puro primero.** Toda regla de negocio vive en `src/lib/engine/*` como funciones
   puras `(state, input, now) → { ok, state, data } | { ok: false, error }`. La UI nunca
   implementa reglas: llama `run((s) => A.accion(s, ...))` del `RougeContext`.
2. **Misma semántica en demo y en Supabase.** Cada acción del motor tiene su contraparte
   RLS/RPC en `schema.sql` (`join_event`, `send_connection`, `send_icebreaker`,
   `trigger_rescue`, `send_blast`, `draw_raffle`, `create_bar_order`, `event_crm`…).
   Si cambiás una regla, cambiala en **ambos** lados y en los tests.
3. **Modo Demo automático.** Sin `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` en `.env.local`,
   la app usa el estado local sembrado por `createSeedState(now)` y persistido en
   `localStorage` (`rouge:state`). Dos pestañas se sincronizan por el evento `storage`
   (simula Realtime). El `PersonaSwitcher` permite "actuar como" cualquier asistente.
   Si cambiás el formato del estado, subí `STATE_VERSION` en `seed.ts` (fuerza re-siembra).
4. **Hidratación solo en cliente.** La semilla depende de `Date.now()`; el provider muestra
   un BootScreen hasta montar. Las páginas de usuario son Client Components.
5. **Una sola interfaz.** `AppShell` renderiza todo dentro de
   `max-w-md mx-auto min-h-screen border-x border-white/10 shadow-2xl relative` salvo
   `/admin/*` (vista expandida). Overlays (`BottomSheet`, `Toaster`) son `fixed` + `max-w-md mx-auto`.
6. **Baja señal.** Comprimir toda imagen con `compressImage()` antes de subir; avatares con
   fallback de iniciales; Service Worker cache-first para estáticos.

## Reglas de negocio (no negociables)

- **Invisibilidad mutua por bloqueo:** si A bloqueó a B (por id **o** por teléfono normalizado
  E.164 vía `normalizePhone`), ninguno ve al otro en grilla, búsquedas, squads, plano ni chat.
  Usar siempre `isBlockedBetween()` / `public.is_blocked()`. Los errores no revelan el bloqueo
  (mensaje genérico "Este perfil no está disponible").
- **Teléfono privado:** nunca se expone a otros usuarios (column privileges en `profiles`);
  solo el CRM del staff (`event_crm`) lo ve.
- **Ghost Mode:** oculta al usuario de la grilla de conexiones; sigue visible para su Squad y matches.
- **Conexión:** like normal → pendiente; like recíproco → match inmediato.
- **Rompehielos:** **1 por evento** (`icebreaker_used`), máx 140 caracteres, fijado arriba en la
  bandeja. Respeta `only_liked_can_icebreak`. Al aceptar, su texto es el primer mensaje del chat.
  Opcional: trago QR prepago adjunto (`gifted_drink`).
- **Efecto Cenicienta:** el lobby abre `lobby_opens_at` y cierra `lobby_expires_at`. Cerrado ⇒
  sin grilla, plano, squads ni conexiones nuevas; **matches y chats 1:1 quedan para siempre**.
- **Pines:** 1 activo por usuario, expiran a los **15 min**. Audiencia elegida manualmente:
  Squad (cian) y/o matches seleccionados (rouge). **Nunca** se comparte con matches no seleccionados.
- **Rescate 🚨:** clava pin rojo compartido con el Squad + `safety_status = rescue_needed` +
  alerta `system_alert` en el chat del Squad. **🏠 Llegué a casa:** borra pines y avisa.
- **QR Drops:** reglas `perk_rules` (ej. Squad de 4 antes de la 01:00) otorgan 1 QR por integrante,
  idempotente (`source_ref_id`).
- **Barra Express:** precios siempre del menú del servidor; la Vaquita reparte `total_spent`
  entre miembros del Squad.

## Sistema de diseño — "Velvet & Laser" Dark UI

| Token | Hex | Uso |
|---|---|---|
| `background` | `#070709` | Obsidian Black — fondo base |
| `surface` | `#121216` | Charcoal Glass — `glass` = `bg-surface/85 backdrop-blur-xl border-white/10` |
| `rouge` | `#FF1E56` (hover `#E01145`) | Primario: matches, rompehielos, SOS — `shadow-glow-rouge` |
| `squad` | `#00F0FF` | Amigos, pines de Squad — `shadow-glow-squad` |
| `vip` | `#FFB800` | Monetización: barra, perks, sorteos, Mesa VIP, Punto Base |
| `text-primary` | `#F8FAFC` | Texto principal |
| `text-muted` | `#94A3B8` | Texto secundario |

- **Tipografía:** `font-display` = Space Grotesk (títulos, badges, métricas, contadores; 600/700,
  tracking tight) · `font-sans` = Plus Jakarta Sans (cuerpo, bios, chat; 400/500/600).
- **Plano:** Squad pulsa cian, Match pulsa rouge, Punto Base es bandera dorada.
- **Tarjetas de grilla:** `aspect-card` (3:4), imagen a sangre, `.card-fade`, badge de % afinidad,
  `.glass-pill` con el Mood.
- **Ergonomía:** botones ≥ 44px (`min-h-touch`), modales `BottomSheet`, una mano.
- No inventar colores nuevos: si hace falta un estado, usar opacidades de los tokens.
- Respetar `prefers-reduced-motion` (ya global en `globals.css`).

## Roadmap

- [x] **Fase 1** — Cimientos, identidad, esquema SQL, motor de reglas y Mock Data.
- [ ] **Fase 2** — Onboarding/perfil (4 fotos comprimidas, loop 5s, géneros, Spotify), privacidad y bloqueos.
- [ ] **Fase 3** — Ingreso `/join/[code]` + Mood, Line-up, grilla por afinidad, Ghost Mode, conexiones y Rompehielos.
- [ ] **Fase 4** — Squads y seguridad, Pin-Drop 15 min, Punto Base, chat realtime (texto + fotos), Perks/QRs y Barra Express.
- [ ] **Fase 5** — `/admin`: eventos y códigos, CRM + CSV, Text Blasts, perks y sorteos, Kanban de barra, Pantalla LED.

## Convenciones

- Código y comentarios técnicos en español rioplatense neutro; identificadores en inglés.
- Campos en `snake_case` (igual que Postgres) en `types.ts`.
- Nada de `any`. Nuevas tablas ⇒ actualizar `types.ts`, `RougeState`, `seed.ts`, `schema.sql`.
- Antes de commitear: `npm run typecheck && npm test && npm run build`.
