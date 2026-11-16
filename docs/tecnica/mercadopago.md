# Mercado Pago — cobros de la Barra Express por marca

Rouge Pass funciona como **marketplace**: cada marca (productora, boliche o fiesta) conecta **su** cuenta de Mercado Pago y
los pagos de la Barra Express entran directo a esa cuenta. Mercado Pago separa en cada cobro la comisión de Rouge Pass
(`marketplace_fee`) y la deposita en la cuenta de la aplicación de Rouge Pass. Rouge Pass nunca toca la plata de la marca ni ve
su clave.

```
Marca ──(OAuth: autoriza a Rouge Pass)──► Mercado Pago ──► token del vendedor (cifrado en brand_payment_accounts)

Asistente pide ─► pedido "awaiting_payment" ─► /api/mercadopago/checkout ─► preferencia (token de la marca,
marketplace_fee) ─► Checkout Pro (billetera, dinero en cuenta, tarjeta) ─► vuelve a /bar?pago=ok
                                                   │
Mercado Pago ─► /api/mercadopago/webhook?brand=… (firma x-signature) ─► GET /v1/payments/{id} con el token de la
marca ─► valida estado, pedido y monto ─► confirm_order_payment (service role) ─► "paid" ─► Realtime ─► comandas
```

## 1. Crear la aplicación en Mercado Pago

1. [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) → *Tus integraciones* → **Crear aplicación**
   con la cuenta de Rouge Pass (la que recibe las comisiones).
2. Producto: **Checkout Pro**; modelo de integración: **Marketplace** (pagos en nombre de vendedores con OAuth).
3. En *Configuración → Redirect URL* cargar: `https://<tu dominio>/api/mercadopago/callback`.
4. En *Webhooks*: URL `https://<tu dominio>/api/mercadopago/webhook`, evento **Pagos**. Copiar la **clave secreta**
   (firma de las notificaciones). Cada preferencia además manda su propia `notification_url` con la marca.
5. Copiar el **Client ID** y el **Client Secret** de las credenciales de producción.

## 2. Variables de entorno (servidor)

| Variable | Valor |
|---|---|
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | Credenciales de la aplicación. |
| `MP_TOKEN_KEY` | 32 bytes aleatorios en base64 para cifrar los tokens: `openssl rand -base64 32`. **No cambiarla** (los tokens guardados dejarían de descifrarse: habría que reconectar las cuentas). |
| `MP_WEBHOOK_SECRET` | Clave secreta de los webhooks (si falta, no se verifica la firma: solo para pruebas). |
| `MP_MARKETPLACE_FEE_PERCENT` | Comisión de Rouge Pass por pedido, en % (ej. `5`). Default `0`. |
| `MP_CURRENCY` | Moneda (default `ARS`). |
| `NEXT_PUBLIC_PAYMENTS_MP` | `1` para mostrar "Conectar Mercado Pago" en el panel. |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` | Ya usadas por Instagram y la API v1. |

## 3. Esquema

Ejecutar `supabase/schema.sql` actualizado (es idempotente): crea `brands`, `brand_payment_accounts`, las columnas de
pago de `bar_orders` y la RPC `confirm_order_payment` (ejecutable solo por `service_role`).

## 4. Rutas (todas solo servidor)

| Ruta | Qué hace |
|---|---|
| `POST /api/mercadopago/connect` `{ brandId }` | Arranca el OAuth (solo quien creó la marca). Devuelve `{ url }`. |
| `GET /api/mercadopago/callback` | Canjea el código por el token, lo cifra y guarda, y prende `payments_enabled`. Vuelve a `/admin/brand?mp=connected` o `?mp_error=`. |
| `DELETE /api/mercadopago/connect` `{ brandId }` | Desconecta: borra los tokens y apaga el cobro online. |
| `POST /api/mercadopago/checkout` `{ orderId }` | Link de Checkout Pro para un pedido propio que espera pago (vence a los 30 min, `binary_mode`). |
| `GET /api/mercadopago/orders/:id` | Concilia: busca pagos aprobados del pedido (vuelta del checkout o webhook demorado). |
| `POST /api/mercadopago/webhook?brand=<id>` | Notificación de pago: firma + consulta a la API + validación + acreditación. |

Los tokens se renuevan solos (`refresh_token`) cuando faltan menos de 7 días para su vencimiento.

## 5. Probar

- **Modo Demo:** en *Marca y cobros* → "Conectar Mercado Pago (demo)"; en la barra aparece un checkout simulado.
- **Sandbox:** con usuarios de prueba de Mercado Pago (vendedor = la marca, comprador = el asistente) y las
  credenciales de prueba de la aplicación. El panel muestra "Modo prueba" si el token no es productivo.
- Tests: `src/lib/payments/mp.test.ts` (firma del webhook, cifrado, state, preferencia, validación del pago) y el caso
  "marca y cobros" de `npm run test:integration` (RLS, `not_paid`, `confirm_order_payment` solo servidor).

## Pendientes

- Reembolsos desde el panel (hoy desde Mercado Pago; el pedido queda pago en Rouge Pass).
- Trago Rompehielos todavía se cobra en la barra.
- Transferencias entre amigos (cuentas de la mesa): se registran en Rouge Pass, pero la transferencia se hace en la app de
  Mercado Pago o del banco con el alias copiado (Mercado Pago no ofrece transferencias P2P por API).
