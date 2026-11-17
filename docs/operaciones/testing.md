# Testing

Cuatro niveles. Antes de cada commit: `npm run typecheck && npm test && npm run build`.

| Nivel | Comando | Qué cubre | Necesita |
|---|---|---|---|
| Unitarios + contrato | `npm test` | Reglas del motor (bloqueos, ghost, pines, rompehielos, barra, roles, Instagram…), helpers de OAuth y el **contrato cliente ↔ `schema.sql`** (nombres de RPC, parámetros, tablas y columnas de cada comando y del cargador). | Nada |
| Seguridad del esquema | `npm test` (`schema.security.test.ts`) | Carga el `schema.sql` real en PGlite (dos veces: idempotente) y ejecuta ~50 ataques como asistentes, staff y anónimos: helpers privados, chats y fotos ajenas, pines, Kanban, QRs, blasts con `javascript:`, fuerza bruta de códigos, privilegios por columna. | Nada |
| Seguridad web | `npm test` (`security.test.ts`) | CSP y headers, redirecciones internas (open redirect), links de blasts, límite de pedidos, cifrado de tokens. | Nada |
| Integración real | `npm run test:integration` | Flujo completo contra un Supabase de verdad con usuarios reales: RLS, privacidad del teléfono, códigos ocultos, roles, Instagram (tokens invisibles, verificado), Realtime y Storage. Se saltea sin credenciales. | Supabase de prueba |
| E2E demo | `npm run e2e:demo` | Navegador real (Playwright) sobre la app en Modo Demo: onboarding, lobby, squad, barra, panel, roles, QR, landing, Instagram/Google simulados; `demo-pro.cjs`: privacidad por contexto, reuniones con sala y `/empresas` (formulario y API de leads). | App en demo levantada |
| E2E API | `npm run e2e:api` | API v1 por HTTP: claves, códigos por entrada idempotentes, paginación, check-in, anulación, QR PNG/SVG, alcance y revocación. | App con Supabase + `SUPABASE_SERVICE_ROLE_KEY` |
| E2E Supabase | `npm run e2e:supabase` · `npm run e2e:instagram` | Navegador real contra Supabase: magic link real (Mailpit), Storage, Realtime, roles; login con Instagram contra una API imitada. | App + Supabase local + Mailpit |

## Integración real

Con un Supabase de prueba (local con `supabase start` o un proyecto de **staging**) que tenga `schema.sql` y `seed.sql`:

```bash
SUPABASE_TEST_URL=http://localhost:54321 \
SUPABASE_TEST_ANON_KEY=<anon key> SUPABASE_TEST_SERVICE_KEY=<service role key> \
npm run test:integration
```

Crea usuarios únicos por corrida, así que se puede repetir sin limpiar la base. Correrlo antes de cada cambio de
`schema.sql` o `commands.ts`. **Nunca contra producción.**

## E2E (Playwright)

Los scripts están en [`e2e/`](../../e2e) y corren contra una app **ya levantada**. Requieren Playwright con Chromium
(`npx playwright install chromium` si no está). Las capturas quedan en `e2e/.out/`.

### Demo

```bash
npm run build && npx next start -p 3100   # sin variables de Supabase
npm run e2e:demo
```

### Supabase

```bash
# App compilada contra el Supabase de prueba
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run build
npx next start -p 3100

SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_KEY=... \
E2E_MAILPIT_URL=http://localhost:8025 npm run e2e:supabase
```

Usa la bandeja de prueba (Mailpit/Inbucket del Supabase local) para abrir los magic links.

### Instagram (API imitada)

`npm run e2e:instagram` levanta `e2e/mocks/instagram-api.cjs` en el puerto 3999. La app tiene que correr apuntando a él:

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
NEXT_PUBLIC_AUTH_INSTAGRAM=1 NEXT_PUBLIC_AUTH_GOOGLE=1 npm run build

SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_APP_URL=http://localhost:3100 \
INSTAGRAM_APP_ID=mock-app INSTAGRAM_APP_SECRET=mock-secret \
INSTAGRAM_OAUTH_URL=http://localhost:3999/oauth/authorize \
INSTAGRAM_TOKEN_URL=http://localhost:3999/oauth/access_token \
INSTAGRAM_GRAPH_URL=http://localhost:3999 INSTAGRAM_MEDIA_HOSTS=localhost \
npx next start -p 3100

SUPABASE_TEST_URL=... SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_KEY=... npm run e2e:instagram
```

Cubre: login con Instagram, @ sugerido, importar fotos (el video queda afuera), verificado, token largo solo en el
servidor, segundo ingreso, cancelar, conectar desde el editor, desconectar, cuenta ya usada y el botón de Google
(verifica la redirección al OAuth de Supabase; el ida y vuelta con Google real se prueba en staging).

## Variables de los E2E

| Variable | Default |
|---|---|
| `E2E_BASE_URL` | `http://localhost:3100` |
| `E2E_OUT` | `e2e/.out` |
| `SUPABASE_TEST_URL` | `http://localhost:8000` |
| `SUPABASE_TEST_ANON_KEY` · `SUPABASE_TEST_SERVICE_KEY` | — |
| `E2E_MAILPIT_URL` | `http://localhost:8025` |
| `E2E_IG_MOCK_URL` | `http://localhost:3999` |

## Validación del SQL

Además de la integración real, el esquema se valida en PGlite (Postgres en memoria) en cada `npm test`
(`src/lib/store/schema.security.test.ts`, con stubs mínimos de `auth`, `storage` y roles de Supabase). Al tocar una
política o una RPC, sumá ahí el ataque que tiene que frenar. Recordar
que PGlite no tiene el schema `extensions` de Supabase: por eso toda función `security definer` fija
`search_path = public, extensions`.
