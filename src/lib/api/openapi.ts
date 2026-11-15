/** Especificación OpenAPI 3.1 de la API v1 (servida en /api/v1/openapi.json). Mantener en sync con src/lib/api/v1.ts. */
import { API_VERSION, MAX_BATCH, MAX_PAGE } from "./v1";

const err = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const eventParam = { name: "eventId", in: "path", required: true, description: "Id (UUID) o slug del evento.", schema: { type: "string" } };
const codeParam = { name: "code", in: "path", required: true, description: "Código de acceso (no distingue mayúsculas).", schema: { type: "string" } };

export function openApiSpec(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "ROUGE API",
      version: API_VERSION,
      description:
        "API para ticketeras y productoras: generar los códigos de acceso de ROUGE y enviarlos junto con cada entrada.\n\n" +
        "**Autenticación:** `Authorization: Bearer <clave>`. La clave se crea en el panel de ROUGE (Eventos y accesos → API para ticketeras) y se muestra una sola vez.\n\n" +
        "**Flujo recomendado:** al emitir cada entrada, pedí un código con `tickets[].external_ref` = id de la entrada en tu sistema (reintentar es seguro: devuelve el mismo código). " +
        "Poné en el mail el `join_url` (botón) y la imagen `qr_url`. Si la entrada se reembolsa, anulá el código con DELETE.",
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Clave rk_live_… de ROUGE." } },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", enum: ["missing_api_key", "invalid_api_key", "insufficient_scope", "forbidden", "event_not_found", "code_not_found", "code_already_used", "validation_error", "not_configured", "internal_error"] },
                message: { type: "string" },
              },
            },
          },
        },
        Code: {
          type: "object",
          required: ["id", "code", "status", "join_url", "qr_url", "created_at"],
          properties: {
            id: { type: "string", format: "uuid" },
            code: { type: "string", example: "K7P2QXMR4A", description: "10 caracteres, sin 0/O/1/I (se puede dictar en la puerta)." },
            status: { type: "string", enum: ["unused", "used", "revoked"] },
            external_ref: { type: ["string", "null"], description: "Id de la entrada en tu sistema." },
            label: { type: ["string", "null"], example: "VIP" },
            join_url: { type: "string", format: "uri", description: "Link para el botón del mail: abre ROUGE con el código cargado." },
            qr_url: { type: "string", format: "uri", description: "Imagen PNG del QR del join_url (agregá ?size=256..1024 o ?format=svg)." },
            created_at: { type: "string", format: "date-time" },
            used_at: { type: ["string", "null"], format: "date-time" },
            revoked_at: { type: ["string", "null"], format: "date-time" },
            created: { type: "boolean", description: "Solo en POST: false si ya existía para ese external_ref." },
          },
        },
        Event: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            name: { type: "string" },
            venue_name: { type: "string" },
            starts_at: { type: "string", format: "date-time" },
            ends_at: { type: "string", format: "date-time" },
            lobby_opens_at: { type: "string", format: "date-time" },
            lobby_expires_at: { type: "string", format: "date-time" },
            max_capacity: { type: "integer" },
            master_link: { type: "string", format: "uri" },
            codes: { type: "object", properties: { total: { type: "integer" }, unused: { type: "integer" }, used: { type: "integer" }, revoked: { type: "integer" } } },
          },
        },
      },
    },
    paths: {
      "/events": {
        get: {
          summary: "Eventos a los que tiene acceso la clave",
          responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Event" } } } } } } }, 401: err("Clave inválida") },
        },
      },
      "/events/{eventId}/codes": {
        parameters: [eventParam],
        post: {
          summary: "Generar códigos de acceso",
          description: `Uno por entrada (\`tickets\`, idempotente por \`external_ref\`) o una cantidad suelta (\`count\`). Máximo ${MAX_BATCH} por request.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "object", required: ["tickets"], properties: { tickets: { type: "array", maxItems: MAX_BATCH, items: { type: "object", required: ["external_ref"], properties: { external_ref: { type: "string", maxLength: 120 }, label: { type: "string", maxLength: 60 } } } }, label: { type: "string", maxLength: 60, description: "Etiqueta por defecto." } } },
                    { type: "object", required: ["count"], properties: { count: { type: "integer", minimum: 1, maximum: MAX_BATCH }, label: { type: "string", maxLength: 60 } } },
                  ],
                },
                examples: {
                  porEntrada: { value: { tickets: [{ external_ref: "ORD-1029-1", label: "General" }, { external_ref: "ORD-1029-2", label: "VIP" }] } },
                  cantidad: { value: { count: 50, label: "Cortesía" } },
                },
              },
            },
          },
          responses: {
            201: { description: "Se crearon códigos nuevos", content: { "application/json": { schema: { type: "object", properties: { event_id: { type: "string" }, created: { type: "integer" }, existing: { type: "integer" }, data: { type: "array", items: { $ref: "#/components/schemas/Code" } } } } } } },
            200: { description: "Todos ya existían (reintento idempotente)" },
            401: err("Clave inválida"),
            403: err("Sin acceso al evento o sin permiso codes:write"),
            404: err("Evento inexistente"),
            422: err("Body inválido"),
          },
        },
        get: {
          summary: "Listar códigos",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["unused", "used", "revoked"] } },
            { name: "external_ref", in: "query", schema: { type: "string" } },
            { name: "label", in: "query", schema: { type: "string" } },
            { name: "used_since", in: "query", description: "ISO 8601: códigos usados desde esa fecha (para sincronizar el check-in).", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: MAX_PAGE, default: 100 } },
            { name: "cursor", in: "query", description: "next_cursor de la página anterior.", schema: { type: "string" } },
          ],
          responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Code" } }, next_cursor: { type: ["string", "null"] } } } } } }, 401: err("Clave inválida"), 404: err("Evento inexistente") },
        },
      },
      "/events/{eventId}/codes/{code}": {
        parameters: [eventParam, codeParam],
        get: { summary: "Estado de un código", responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Code" } } } } } }, 404: err("No existe") } },
        delete: { summary: "Anular un código (entrada reembolsada)", description: "Idempotente. Un código ya usado no se puede anular (409).", responses: { 200: { description: "Anulado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Code" } } } } } }, 404: err("No existe"), 409: err("Ya se usó") } },
      },
      "/qr/{code}": {
        parameters: [codeParam, { name: "format", in: "query", schema: { type: "string", enum: ["png", "svg"], default: "png" } }, { name: "size", in: "query", schema: { type: "integer", minimum: 128, maximum: 1024, default: 512 } }],
        get: { summary: "Imagen QR del link de ingreso", security: [], responses: { 200: { description: "PNG o SVG", content: { "image/png": {}, "image/svg+xml": {} } } } },
      },
    },
  };
}
