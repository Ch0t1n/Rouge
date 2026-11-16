# Guía paso a paso para salir a producción

Checklist para tener **todas** las funciones de ROUGE andando con gente real: logins, cobros, registros legales y la
operación de la primera fiesta. Marcado con ✅ lo que ya quedó hecho en el proyecto actual
(`rouge-neon.vercel.app` + Supabase `dwfuxhmpuitvtuepfwiv`).

| Sitio | URL | Para qué |
|---|---|---|
| Producción | https://rouge-neon.vercel.app | Fiestas reales (Supabase) |
| Demo para anfitriones | https://rouge-demo.vercel.app/demo | Mostrar y vender (sin datos reales) |

---

## 0. Ya hecho

- ✅ Base de datos instalada (`supabase/schema.sql` v1.4): 26 tablas con seguridad por fila, funciones, almacenamiento
  de fotos y tiempo real.
- ✅ Login por mail apuntando a `rouge-neon.vercel.app` (Site URL y Redirect URLs de Supabase).
- ✅ Limpieza automática de pines vencidos cada 5 minutos (`pg_cron`).
- ✅ Vercel: `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_DEMO_URL` cargadas; sitio de demo `rouge-demo` publicado desde `main`.

> Cada vez que se actualiza `supabase/schema.sql` hay que volver a ejecutarlo (es seguro: no borra datos).

## 1. Dominio propio (recomendado, 15 min)

1. Comprá el dominio (ej. en NIC.ar o Namecheap) y en **Vercel → rouge → Settings → Domains** agregá
   `app.tudominio.com`; seguí las instrucciones de DNS.
2. Para la demo: **Vercel → rouge-demo → Domains** → `demo.tudominio.com`.
3. Actualizá `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_DEMO_URL` en Vercel y **redeploy**.
4. Supabase → **Authentication → URL Configuration**: Site URL `https://app.tudominio.com` y agregá
   `https://app.tudominio.com/**` en Redirect URLs.
5. Si ya configuraste Google, Instagram o Mercado Pago, cambiá ahí también las URLs de vuelta (pasos 3, 4 y 5).

## 2. Login por mail (link mágico) — imprescindible (30 min)

Hoy los mails salen del servidor de prueba de Supabase: **solo 2 por hora**. Una fiesta lo supera en un minuto.

1. Creá una cuenta en **Resend** (gratis hasta 3.000 mails/mes) o Brevo. Verificá tu dominio (registros DNS que te
   indican: SPF, DKIM).
2. Supabase → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*:
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = API key de Resend, remitente
   `ROUGE <hola@tudominio.com>`.
3. **Authentication → Rate Limits**: subí "emails por hora" (ej. 300).
4. **Authentication → Emails → Templates**: traducí el asunto y el texto del "Magic Link" al español
   ("Tu link para entrar a ROUGE").
5. Probá: entrá a `/login`, pedí el link y abrilo en el celular.

## 3. Login con Google (30 min)

1. [Google Cloud Console](https://console.cloud.google.com) → proyecto nuevo "ROUGE".
2. **APIs y servicios → Pantalla de consentimiento OAuth**: tipo *Externo*, nombre ROUGE, logo, mail de soporte,
   dominio, links a tus Términos y Política de privacidad (paso 7). Publicala ("En producción").
3. **Credenciales → Crear ID de cliente OAuth** → *Aplicación web*. URI de redireccionamiento autorizada:
   `https://dwfuxhmpuitvtuepfwiv.supabase.co/auth/v1/callback`.
4. Supabase → **Authentication → Sign In / Providers → Google**: pegá el Client ID y el Client Secret. Guardar.
5. Vercel → `NEXT_PUBLIC_AUTH_GOOGLE=1` → redeploy.

## 4. Login con Instagram + importar fotos (1–3 días por la revisión de Meta)

Solo funciona con cuentas **profesionales** de Instagram (Creador o Empresa), por regla de Meta.

1. [Meta for Developers](https://developers.facebook.com) → *Crear app* → tipo **Empresa**.
2. Agregá el producto **Instagram → API setup with Instagram login**.
3. *Redirect URI válida*: `https://rouge-neon.vercel.app/api/instagram/callback` (o tu dominio).
   *Deauthorize* y *Data deletion callback*: `https://rouge-neon.vercel.app/api/instagram/data-deletion`.
4. Permiso `instagram_business_basic`. Para el público general, Meta pide **verificación del negocio** y **App
   Review** (video mostrando el login y el uso de las fotos).
5. Vercel: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (ya está),
   `NEXT_PUBLIC_AUTH_INSTAGRAM=1` → redeploy.

## 5. Cobros con Mercado Pago (1 día + aprobación)

Cada marca conecta SU cuenta; la plata le entra directo y Mercado Pago le separa a ROUGE la comisión.

1. Con la cuenta de Mercado Pago **de ROUGE** (la que cobra las comisiones): [Mercado Pago Developers](https://www.mercadopago.com.ar/developers)
   → *Tus integraciones* → **Crear aplicación** → producto *Checkout Pro*, modelo **Marketplace**.
2. *Redirect URL*: `https://rouge-neon.vercel.app/api/mercadopago/callback`.
3. *Webhooks*: URL `https://rouge-neon.vercel.app/api/mercadopago/webhook`, evento **Pagos**. Copiá la clave secreta.
4. Generá la clave de cifrado: en una terminal `openssl rand -base64 32` (guardala en un lugar seguro y **no la
   cambies nunca**: si cambia, las marcas tienen que reconectar).
5. Vercel → variables (Production): `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TOKEN_KEY`, `MP_WEBHOOK_SECRET`,
   `MP_MARKETPLACE_FEE_PERCENT` (tu comisión, ej. `5`), `MP_CURRENCY=ARS`, `NEXT_PUBLIC_PAYMENTS_MP=1` → redeploy.
6. **Prueba con usuarios de prueba** de Mercado Pago (vendedor = la marca, comprador = asistente) usando las
   credenciales de prueba; después cambiá a las de producción.
7. En la app: el dueño/a entra a **Marca y cobros → Conectar Mercado Pago**, autoriza, y listo.

Detalle técnico: [docs/tecnica/mercadopago.md](../tecnica/mercadopago.md).

## 6. Ticketeras (opcional, 10 min por cliente)

Si una productora vende con su propio sistema: en **Eventos y accesos → API para ticketeras** crea una clave y le
pasás la [guía de la API](../api/README.md). No requiere más configuración.

## 7. Registros y papeles (Argentina)

No es asesoramiento legal: validalo con tu contador/abogado.

| Qué | Dónde | Por qué |
|---|---|---|
| **CUIT y alta impositiva** (monotributo o responsable inscripto) | ARCA (ex AFIP) | Para facturar a los organizadores la comisión y el fee por evento. |
| **Facturación electrónica** | ARCA → Comprobantes en línea / Factura electrónica | Tu facturación a los clientes. Las ventas de la barra las factura cada boliche (el ticket de ROUGE no es factura). |
| **Registro de bases de datos personales** | AAIP — Registro Nacional de Bases de Datos (Ley 25.326) | ROUGE guarda nombre, teléfono, fotos y gustos de los asistentes. |
| **Términos y condiciones + Política de privacidad** | Páginas públicas en tu dominio | Las piden Google, Meta y Mercado Pago, y la Ley 25.326. Incluí: datos que se guardan, para qué, quién los ve (organizador), cómo borrar la cuenta, +18. |
| **Contrato con cada organizador** | Plantilla propia | Fee, comisión, responsabilidad por la venta de alcohol a mayores de 18 (Ley 24.788) y uso de los datos del CRM. |
| **Defensa del consumidor** | Ley 24.240 / Res. 424/2020 | Si vendés servicios online a consumidores: "botón de arrepentimiento" y datos de contacto visibles. |
| **Marca "ROUGE"** | INPI | Registrar la marca antes de invertir en publicidad. |

## 8. Supabase para el primer evento real

1. **Plan Pro** (USD 25/mes): backups diarios y el proyecto no se pausa por inactividad (el plan gratis se pausa a
   la semana sin uso).
2. **Authentication → Providers → Email**: dejá activo "Confirm email".
3. Revisá **Database → Reports** después de la primera fiesta (conexiones y consultas lentas).

## 9. Primera fiesta (el día antes)

1. El dueño/a entra a `rouge-neon.vercel.app/login` → pestaña **Equipo** → se registra con su mail.
2. **Marca y cobros**: logo, colores y conectar Mercado Pago.
3. **Eventos y accesos → Nuevo evento**: horarios, cupo, plano y line-up. Generá los códigos de 1 uso o usá el link maestro.
4. **Menú de la barra**: precios reales; marcá "Agotado" lo que no haya.
5. **Equipo**: sumá producción, barra, mozos y seguridad por su @usuario (primero se tienen que registrar).
6. **Perks**: regla de trago de bienvenida (ej. Squad de 4 antes de la 01:00).
7. En la barra: una notebook o tablet con **Barra / POS** abierto y, si querés tickets, una impresora térmica de
   80 mm conectada (cada comanda tiene el botón 🖨️).
8. Probá todo el circuito con 2 celulares: entrar con el link, armar Squad, pedir, pagar, preparar, entregar.

## 10. Verificación final

Recorré el [checklist de lanzamiento](./checklist-lanzamiento-v1.md). Pruebas automáticas contra un Supabase de
**staging** (nunca producción): [Testing](./testing.md).
