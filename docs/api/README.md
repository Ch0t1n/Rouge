# API de ROUGE para ticketeras y productoras (v1)

Permite que tu sistema de entradas **genere los códigos de acceso de ROUGE y los mande junto con cada entrada**.
Quien compra recibe en el mail de su entrada un botón y un QR que lo llevan directo al lobby del evento.

- **Base URL:** `https://<tu-dominio-rouge>/api/v1`
- **Especificación OpenAPI 3.1:** `GET /api/v1/openapi.json` (importala en Postman o Insomnia, o generá un cliente)
- **Formato:** JSON en UTF-8. Fechas en ISO 8601 (UTC).

## 1. Obtener una clave

1. En el panel de ROUGE, como **dueño/a o producción** del evento: *Eventos y accesos → API para ticketeras*.
2. Poné un nombre (ej. "Ticketera Pasaje") y elegí el alcance:
   - **Solo este evento**, o
   - **Todos mis eventos** (los que administra quien crea la clave, presentes y futuros).
3. Copiá la clave `rk_live_…`. **Se muestra una sola vez**: ROUGE guarda solo su huella (SHA-256).

Usala en cada request:

```http
Authorization: Bearer rk_live_xxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Guardala en el servidor (variable de entorno o gestor de secretos). **Nunca** la pongas en una app o página web.
- Si se filtra, revocala desde el mismo panel: deja de funcionar al instante.
- Si quien creó la clave sale del equipo del evento, la clave pierde acceso a ese evento.

## 2. Flujo recomendado

```mermaid
sequenceDiagram
  participant T as Tu sistema de entradas
  participant R as API de ROUGE
  participant C as Comprador/a
  T->>R: POST /events/{evento}/codes { tickets: [{ external_ref: "ORD-1029-1" }] }
  R-->>T: code, join_url, qr_url
  T->>C: Mail de la entrada con botón (join_url) y QR (qr_url)
  C->>R: Abre el link o escanea el QR → entra al lobby
  Note over T,R: Si la entrada se reembolsa
  T->>R: DELETE /events/{evento}/codes/{code}
```

1. Al **emitir cada entrada**, pedí un código con `external_ref` = el id de esa entrada en tu sistema.
2. Mandá en el mail el `join_url` (como botón) y la imagen `qr_url`.
3. Si la entrada se **reembolsa o cancela**, anulá el código.
4. Opcional: consultá los códigos usados para saber quién ya entró a la app.

**Idempotencia:** pedir de nuevo un código para el mismo `external_ref` devuelve **el mismo código** (`created: false`).
Podés reintentar sin miedo a duplicar si hubo un timeout.

## 3. Endpoints

| Método | Ruta | Permiso | Para qué |
|---|---|---|---|
| `GET` | `/events` | `codes:read` | Eventos a los que tiene acceso la clave, con link maestro y contadores. |
| `POST` | `/events/{evento}/codes` | `codes:write` | Generar códigos: uno por entrada (`tickets`) o una cantidad (`count`). Máx. 1000 por request. |
| `GET` | `/events/{evento}/codes` | `codes:read` | Listar con filtros y paginación. |
| `GET` | `/events/{evento}/codes/{code}` | `codes:read` | Estado de un código. |
| `DELETE` | `/events/{evento}/codes/{code}` | `codes:write` | Anular un código no usado. |
| `GET` | `/qr/{code}` | público | QR del link de ingreso (PNG; `?format=svg`, `?size=128..1024`). |

`{evento}` acepta el **id (UUID)** o el **slug** (ej. `bresh-sabado`).

### Generar un código por entrada

```bash
curl -X POST https://app.rouge.com.ar/api/v1/events/bresh-sabado/codes \
  -H "Authorization: Bearer $ROUGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "label": "General",
        "tickets": [
          { "external_ref": "ORD-1029-1" },
          { "external_ref": "ORD-1029-2", "label": "VIP" }
        ]
      }'
```

Respuesta `201 Created` (o `200 OK` si todos ya existían):

```json
{
  "event_id": "0b6f…",
  "created": 2,
  "existing": 0,
  "data": [
    {
      "id": "5c1e…",
      "code": "K7P2QXMR4A",
      "status": "unused",
      "external_ref": "ORD-1029-1",
      "label": "General",
      "join_url": "https://app.rouge.com.ar/join/K7P2QXMR4A",
      "qr_url": "https://app.rouge.com.ar/api/v1/qr/K7P2QXMR4A",
      "created_at": "2026-11-15T13:02:11.120Z",
      "used_at": null,
      "revoked_at": null,
      "created": true
    }
  ]
}
```

### Generar códigos sueltos (cortesías, listas)

```json
POST /events/bresh-sabado/codes
{ "count": 50, "label": "Cortesía" }
```

No es idempotente: cada request crea códigos nuevos.

### Listar y sincronizar

```
GET /events/bresh-sabado/codes?status=used&used_since=2026-11-15T22:00:00Z&limit=500
```

| Parámetro | Valores |
|---|---|
| `status` | `unused` · `used` · `revoked` |
| `external_ref` | id exacto de tu entrada |
| `label` | etiqueta exacta |
| `used_since` | ISO 8601: usados desde esa fecha |
| `limit` | 1–500 (default 100) |
| `cursor` | `next_cursor` de la página anterior |

Respuesta: `{ "data": [...], "next_cursor": "…" | null }`. Seguí pidiendo con `cursor` hasta que venga `null`.

### Anular (reembolso)

```bash
curl -X DELETE https://app.rouge.com.ar/api/v1/events/bresh-sabado/codes/K7P2QXMR4A \
  -H "Authorization: Bearer $ROUGE_API_KEY"
```

Devuelve el código con `"status": "revoked"`. Es idempotente. Un código **ya usado** no se puede anular (`409`).
Un código anulado deja de servir para entrar y se ve como inválido.

## 4. El mail de la entrada

Los clientes de mail no muestran SVG: usá el **PNG** de `qr_url`.

```html
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;text-align:center">
  <tr><td style="font:600 18px Arial,sans-serif;color:#111">Tu acceso a la app de la fiesta</td></tr>
  <tr><td style="padding:16px 0">
    <img src="{{qr_url}}?size=320" width="160" height="160" alt="QR de acceso a ROUGE" style="display:block;margin:0 auto">
  </td></tr>
  <tr><td style="font:14px Arial,sans-serif;color:#444">Código: <b style="letter-spacing:2px">{{code}}</b></td></tr>
  <tr><td style="padding-top:16px">
    <a href="{{join_url}}" style="background:#FF1E56;color:#fff;font:600 15px Arial,sans-serif;padding:12px 22px;border-radius:12px;text-decoration:none;display:inline-block">Entrar al lobby</a>
  </td></tr>
</table>
```

Texto sugerido: *"Con este código entrás a ROUGE, la app de la fiesta: conocé gente afín, armá tu Squad y pedí en la
barra sin fila. Es personal: queda asociado a tu perfil cuando entrás."*

## 5. Ejemplo en Node.js

```js
const ROUGE = "https://app.rouge.com.ar/api/v1";

async function codigoParaEntrada(evento, entrada) {
  const res = await fetch(`${ROUGE}/events/${evento}/codes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ROUGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tickets: [{ external_ref: entrada.id, label: entrada.tipo }] }),
  });
  if (!res.ok) throw new Error((await res.json()).error.message);
  const { data } = await res.json();
  return data[0]; // { code, join_url, qr_url, ... }
}
```

## 6. Errores

Formato: `{ "error": { "code": "…", "message": "…" } }`.

| HTTP | `code` | Qué pasó |
|---|---|---|
| 401 | `missing_api_key` · `invalid_api_key` | Falta la clave, no existe o fue revocada. |
| 403 | `insufficient_scope` · `forbidden` | La clave no tiene ese permiso o acceso al evento. |
| 404 | `event_not_found` · `code_not_found` | El evento no existe o no es de esta clave; el código no existe en ese evento. |
| 409 | `code_already_used` | Se quiso anular un código que ya se usó. |
| 422 | `validation_error` | Body o parámetros inválidos (el `message` dice cuál). |
| 429 | `rate_limited` | Demasiados pedidos (300/min por IP, 600/min por clave; QR: 120/min por IP). Esperá lo que indica `Retry-After`. |
| 500 / 503 | `internal_error` · `not_configured` | Error del servidor: reintentá con espera. |

## 7. Límites y buenas prácticas

- Hasta **1000 códigos por request** (body de hasta 512 KB); para tiradas grandes, mandá varios lotes.
- `external_ref`: 1–120 caracteres, único por evento. `label`: hasta 60.
- Los códigos tienen 10 caracteres de un alfabeto sin 0/O/1/I (se pueden dictar en la puerta) y ≈ 2^50 combinaciones.
- El código es **personal**: al entrar queda asociado al perfil de quien lo usó.
- Reintentá ante `5xx` o timeouts con espera exponencial; con `tickets` el reintento es seguro.
- La API no tiene CORS habilitado a propósito: llamala desde tu servidor.

## 8. Requisitos del lado de ROUGE (operación)

La API corre en el mismo despliegue de la app y necesita, en el servidor:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_APP_URL` (dominio que va en `join_url` y `qr_url`).
En producción `NEXT_PUBLIC_APP_URL` es obligatoria: sin ella la API responde `503 not_configured` (los links y QRs nunca se
arman con el header `Host` del pedido, que podría apuntar a otro dominio).
Ver [Puesta en producción](../operaciones/puesta-en-produccion.md).
