# Documentación de Rouge Pass v1.0

**La noche, conectada.** PWA social y operativa para eventos, fiestas y boliches (B2B2C).

## Producto

| Documento | Para quién |
|---|---|
| [Catálogo de funcionalidades](producto/funcionalidades.md) | Todos: qué hace la v1, pantalla por pantalla y rol por rol. |
| [Guía para asistentes](producto/guia-asistentes.md) | Público / soporte: cómo se usa y preguntas frecuentes. |
| [Guía para organizadores y equipo](producto/guia-equipo.md) | Dueños, producción, barra, mozos y seguridad: preparar y operar la noche. |
| [Demo comercial y Modo Demo](producto/demo-comercial.md) | Ventas y redes: guion de 7 minutos, personas del demo, material. |

## Técnica

| Documento | Contenido |
|---|---|
| [Arquitectura](tecnica/arquitectura.md) | Stack, motor de reglas, comandos, modos de datos, roles, login social, carpetas. |
| [Base de datos](tecnica/base-de-datos.md) | Tablas, RPCs y quién puede usarlas, triggers, Storage, Realtime, reglas para cambiar el esquema. |
| [Seguridad y privacidad](tecnica/seguridad-y-privacidad.md) | Qué ve cada uno, controles, limitaciones conocidas y cumplimiento. |

## Integraciones

| Documento | Contenido |
|---|---|
| [API para ticketeras y productoras](api/README.md) | Claves, generar un código por entrada, mail con QR, reembolsos, check-in, errores. Especificación en `/api/v1/openapi.json`. |

## Operaciones

| Documento | Contenido |
|---|---|
| [Puesta en producción](operaciones/puesta-en-produccion.md) | Demo pública y producción en Vercel + Supabase, variables, Google, Instagram, SMTP. |
| [Testing](operaciones/testing.md) | Unitarios, contrato, integración real y E2E con Playwright. |
| [Checklist de lanzamiento v1](operaciones/checklist-lanzamiento-v1.md) | Todo lo que hay que tildar antes del primer evento real. |

Historial de versiones: [CHANGELOG](../CHANGELOG.md) · Guía para agentes de código: [CLAUDE.md](../CLAUDE.md)
