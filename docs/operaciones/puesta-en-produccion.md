# Puesta en producción

> ¿Querés el paso a paso con lo que ya está hecho marcado? Mirá la
> [guía de producción paso a paso](./guia-produccion-paso-a-paso.md).

Recomendado: **dos despliegues** en Vercel desde el mismo repo.

| Despliegue | Dominio sugerido | Variables | Para qué |
|---|---|---|---|
| **Demo pública** | `demo.tudominio.com` | Ninguna de Supabase | Redes, ventas, prensa. Cada visitante tiene su propia fiesta de prueba en su navegador. |
| **Producción** | `app.tudominio.com` | Supabase + login social | Eventos reales. |

## Demo pública

1. Entrá a [vercel.com/new](https://vercel.com/new) con tu cuenta de GitHub y elegí **Import** en `Ch0t1n/Rouge`
   (si no aparece, *Adjust GitHub App Permissions* y dale acceso al repo).
2. Dejá todo como viene (Framework: Next.js, rama `main`) y **no cargues variables de entorno**. Tocá **Deploy**.
3. En 2–3 minutos te da una URL `https://<proyecto>.vercel.app`. Para un dominio propio: *Settings → Domains*
   (ej. `demo.tudominio.com`).

Listo: la app arranca en Modo Demo y se vuelve a publicar sola con cada cambio en `main`.

Qué mostrar: `/` (landing), `/login` → **Asistente** (la app) o **Equipo** (Dueña, Producción, Barra, Mozo,
Seguridad). Guion de 7 minutos en [Demo comercial](../producto/demo-comercial.md). La API para ticketeras responde
`not_configured` en la demo (necesita Supabase).

## Producción

### 1. Supabase

1. Crear el proyecto en [supabase.com](https://supabase.com) (región más cercana al público, ej. São Paulo).
2. **SQL Editor** → ejecutar `supabase/schema.sql` completo. Opcional: `supabase/seed.sql` (evento de prueba).
3. **Authentication → URL Configuration:**
   - *Site URL*: `https://app.tudominio.com`
   - *Redirect URLs*: `https://app.tudominio.com/**` (y `http://localhost:3000/**` para desarrollo).
4. **Authentication → SMTP:** configurar un SMTP propio (Resend, Postmark, SES…). El SMTP de prueba de Supabase
   manda muy pocos mails por hora y una fiesta lo supera en minutos.
5. **Database → Extensions → pg_cron** y programar la limpieza de pines:
   ```sql
   select cron.schedule('purge-pins', '*/5 * * * *', $$select public.purge_expired_pins()$$);
   ```
6. **Backups:** activar los backups diarios (plan Pro) antes del primer evento real.

### 2. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Obligatoria | Dónde se usa | Valor |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Navegador | *Project Settings → API → Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Navegador | *Project Settings → API → anon public* |
| `NEXT_PUBLIC_APP_URL` | Con Instagram o API | Servidor | `https://app.tudominio.com` (vuelta del OAuth y links/QR que devuelve la API). **Obligatoria en producción**: sin ella Instagram queda deshabilitado (el origen nunca se toma del header `Host`). |
| `NEXT_PUBLIC_AUTH_GOOGLE` | No | Navegador | `1` para mostrar "Continuar con Google" |
| `NEXT_PUBLIC_AUTH_INSTAGRAM` | No | Navegador | `1` para mostrar Instagram (login, conectar e importar fotos) |
| `INSTAGRAM_APP_ID` | Con Instagram | Servidor | App de Meta |
| `INSTAGRAM_APP_SECRET` | Con Instagram | Servidor | App de Meta (secreto) |
| `SUPABASE_SERVICE_ROLE_KEY` | Con Instagram o API | **Solo servidor** | *Project Settings → API → service_role*. Nunca con prefijo `NEXT_PUBLIC_`. |
| `INSTAGRAM_TOKEN_KEY` | Recomendada con Instagram | **Solo servidor** | Secreto largo para cifrar los tokens de Instagram en la base (AES-256-GCM). Generarlo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Si se cambia, cada usuario reconecta Instagram. |

Opcionales (tests o casos especiales): `INSTAGRAM_OAUTH_URL`, `INSTAGRAM_TOKEN_URL`, `INSTAGRAM_GRAPH_URL`,
`INSTAGRAM_MEDIA_HOSTS`, `INSTAGRAM_PLACEHOLDER_EMAIL_DOMAIN`.

> Las variables `NEXT_PUBLIC_*` se fijan **al compilar**: después de cambiarlas hay que volver a desplegar.

### 3. Google

1. [Google Cloud Console](https://console.cloud.google.com/) → proyecto → *APIs y servicios*:
   - *Pantalla de consentimiento OAuth*: nombre Rouge Pass, logo, email de soporte, dominio y **política de privacidad**.
     Publicarla (con muchos usuarios Google pide verificación).
   - *Credenciales → Crear ID de cliente OAuth* (aplicación web). URI de redireccionamiento autorizada:
     `https://<proyecto>.supabase.co/auth/v1/callback`.
2. Supabase → *Authentication → Providers → Google*: pegar Client ID y Secret, activar.
3. `NEXT_PUBLIC_AUTH_GOOGLE=1` y redeploy.

### 4. Instagram

1. [Meta for Developers](https://developers.facebook.com/) → *Crear app* → agregar el producto **Instagram** →
   *API setup with Instagram login*. Permiso: `instagram_business_basic`.
2. En la configuración del login de Instagram:
   - *Valid OAuth Redirect URIs*: `https://app.tudominio.com/api/instagram/callback`
   - *Deauthorize callback URL* y *Data deletion request URL*: `https://app.tudominio.com/api/instagram/data-deletion`
3. Cargar `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` y
   `NEXT_PUBLIC_AUTH_INSTAGRAM=1`. Redeploy.
4. **Modo desarrollo:** solo entran las cuentas agregadas como *Instagram testers* (y aceptadas desde la app de
   Instagram). **Para el público:** App Review de Meta con política de privacidad, verificación del negocio, video de
   uso y la descripción de para qué se usa el permiso ("mostrar el @ en el perfil e importar fotos propias").

> Solo cuentas **profesionales** (Creador o Empresa) pueden conectarse. Las personales pueden escribir su @ a mano.

### 5. API para ticketeras

Con `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_APP_URL` cargadas, la API queda en `https://app.tudominio.com/api/v1`.
Cada organizador crea sus claves desde el panel. Guía para pasarle a la ticketera: [docs/api](../api/README.md).

### 5b. Cobros con Mercado Pago (opcional)

Para que cada marca cobre la Barra Express con su cuenta de Mercado Pago (y Rouge Pass reciba su comisión automática),
seguí [Mercado Pago](../tecnica/mercadopago.md): app de Marketplace, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`,
`MP_TOKEN_KEY`, `MP_WEBHOOK_SECRET`, `MP_MARKETPLACE_FEE_PERCENT` y `NEXT_PUBLIC_PAYMENTS_MP=1`.

### 5c. Analíticas de Vercel

La app ya trae `@vercel/analytics` (componente `VercelAnalytics` en el layout). Para que empiece a medir:
**Vercel → proyecto → Analytics → Enable** y volver a desplegar. Sin cookies, no hace falta banner. Las URLs se
envían sin query ni fragmento y con `/join/[code]`, `/u/[username]` y `/chat/[connectionId]` en lugar del valor real
(`src/lib/telemetry/redactUrl.ts`): nunca salen códigos de acceso, usernames, ids ni tokens. En local no envía nada.

### 6. Dominio y verificación final

1. Asignar `app.tudominio.com` en Vercel.
2. Verificar los headers de seguridad: `curl -sI https://app.tudominio.com/app` tiene que mostrar
   `content-security-policy` (con `nonce-…` y el dominio de Supabase), `strict-transport-security`, `x-frame-options: DENY`
   y `permissions-policy`. Un escáner gratuito (securityheaders.com o MDN HTTP Observatory) sirve de control externo.
3. **Límite de pedidos en el borde:** el de `/api/*` es en memoria por instancia. Para un evento grande, sumar una regla en
   *Vercel → Firewall* (por ejemplo 60 pedidos/min por IP a `/api/instagram/*`).
4. Reportes de CSP: aparecen en los logs de Vercel como `[csp] <directiva> <recurso bloqueado> <página>`. Si aparece un
   origen legítimo nuevo, se agrega en `src/lib/security/headers.ts`.
5. Recorrer el [checklist de lanzamiento](./checklist-lanzamiento-v1.md).
3. Opcional: correr las pruebas de integración contra un proyecto de **staging** (nunca contra producción):
   ver [Testing](./testing.md).

## Actualizar el esquema en producción

`schema.sql` es idempotente: se vuelve a ejecutar completo en el SQL Editor. Antes, `npm test` (incluye los ataques a RLS
sobre PGlite), probarlo en staging y correr `npm run test:integration` contra staging.

Nunca agregar el schema `private` a *Project Settings → API → Exposed schemas*: ahí viven los helpers de permisos y no
tienen que poder llamarse por la API.

## Costos de referencia

- Vercel: Hobby gratis para la demo; Pro recomendado para producción comercial.
- Supabase: Free para pruebas; **Pro** para eventos reales (backups, más conexiones de Realtime, sin pausas).
- SMTP transaccional: planes gratuitos alcanzan para empezar.
