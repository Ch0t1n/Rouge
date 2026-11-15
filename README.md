# ROUGE

**La noche, conectada.** PWA social y operativa para eventos, fiestas y boliches (B2B2C) · **v1.1.0**

El asistente entra al lobby privado del evento con un link o QR, conecta con gente afín, arma su **Squad** (con
botón de rescate), se ubica en el **plano** con pines de 15 minutos y pide en la **Barra Express** sin fila. El
organizador opera toda la noche desde un panel con roles para su equipo (dueño/a, producción, barra, mozos, seguridad).

📚 **Documentación completa:** [`docs/`](docs/README.md) — funcionalidades, guías de uso, demo comercial,
arquitectura, base de datos, seguridad, puesta en producción, testing y checklist de lanzamiento.

## Arranque rápido

```bash
npm install
npm run dev
# http://localhost:3000        landing pública
# http://localhost:3000/login  elegí cómo entrar (Asistente / Equipo)
```

Sin credenciales de Supabase la app arranca en **Modo Demo**: una fiesta en vivo precargada
("ROUGE Night × Bresh Sábado") con asistentes, Squads, matches, pines, QRs, pedidos y el equipo completo. Todo
persiste en el navegador.

- En `/login` elegí **Asistente** (entrás a `/app`) o **Equipo**: Dueña, Producción, Barra, Mozo o Seguridad. Cada
  rol entra a su pantalla y solo ve sus secciones.
- **Continuar con Instagram / Google** están simulados en el demo (Instagram sugiere tu @ e importa fotos de un feed de ejemplo).
- Abrí una **segunda pestaña** con otra persona para simular otro teléfono: los cambios se sincronizan.
- Todo link tiene su **QR** (evento, códigos de 1 uso, Squad, perfil). `/admin/live-wall` es la Pantalla LED.

## Conectar Supabase (producción)

1. Ejecutá [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor (opcional: `supabase/seed.sql`).
2. `cp .env.example .env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Configurá las URLs de Auth y un SMTP propio.
4. Opcional: login con **Google** e **Instagram** (`NEXT_PUBLIC_AUTH_GOOGLE=1`, `NEXT_PUBLIC_AUTH_INSTAGRAM=1` y sus credenciales).

Paso a paso (Vercel, variables, Google, Meta, pg_cron, backups): [Puesta en producción](docs/operaciones/puesta-en-produccion.md).

> Instagram solo permite conectar cuentas **profesionales** (Creador o Empresa). Las personales pueden escribir su @
> a mano (se muestra como "sin verificar").

## API para ticketeras

Las productoras con sistema de entradas propio generan un código de ROUGE por entrada y lo mandan en el mail con su QR:
`POST /api/v1/events/{evento}/codes`. Claves desde el panel (*Eventos y accesos → API para ticketeras*).
Guía: [docs/api](docs/api/README.md) · Especificación: `/api/v1/openapi.json`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción (activa el Service Worker) |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Motor de reglas, helpers y contrato cliente ↔ `schema.sql` |
| `npm run test:integration` | Integración real contra un Supabase de prueba (`SUPABASE_TEST_*`) |
| `npm run e2e:demo` · `e2e:supabase` · `e2e:instagram` · `e2e:api` | Pruebas en navegador / HTTP contra una app levantada |
| `node scripts/capture-landing-shots.cjs` | Re-captura las pantallas reales de la landing |

Detalle en [Testing](docs/operaciones/testing.md).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Storage, Realtime) · Vitest · Playwright.
Arquitectura y convenciones: [docs/tecnica/arquitectura.md](docs/tecnica/arquitectura.md) y [`CLAUDE.md`](CLAUDE.md).

Historial de versiones: [CHANGELOG.md](CHANGELOG.md).
