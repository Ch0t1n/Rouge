# ROUGE

**La noche, conectada.** PWA social y operativa para eventos, fiestas y discotecas (B2B2C):
lobby privado por evento, grilla por afinidad musical, Rompehielos, Squads con botón de rescate,
plano interactivo con pines de 15 minutos, perks/QR, Barra Express y suite B2B para organizadores.

## Arranque rápido

```bash
npm install
npm run dev
# → http://localhost:3000        landing pública
# → http://localhost:3000/login  elegí cómo entrar (Asistente / Equipo)
```

Sin credenciales de Supabase la app arranca en **Modo Demo**: un evento en vivo
("ROUGE Night × Bresh Sábado"), 13 asistentes, un Squad activo, matches, rompehielos,
pines en el plano, QRs y pedidos de barra precargados. Todo persiste en `localStorage`.

- En `/login` elegí **Asistente** (entrás a la app en `/app`) o **Equipo**: Dueña, Producción, Barra, Mozo o
  Seguridad. Cada rol entra a su pantalla y solo ve sus secciones (la barra no ve el CRM, seguridad ve las
  alertas de rescate).
- Tocá tu avatar arriba a la derecha para **actuar como** otra persona.
- Todo link tiene su **QR** (entrada al evento, códigos de 1 uso, invitación al Squad, perfil): compartir, WhatsApp,
  copiar o descargar PNG. `/admin/print-codes` imprime un QR por código libre.
- Abrí una **segunda pestaña** para simular otro teléfono: los cambios se sincronizan.
- `/admin` (entrando como Dueña) abre el panel del organizador (vista expandida): resumen con ROI, eventos y códigos de
  1 uso, CRM exportable, Text Blasts, perks y sorteo en vivo, comandas de barra y la Pantalla LED
  (`/admin/live-wall`, para conectar por HDMI).
- Probá el circuito completo con dos pestañas: el panel del organizador en una y la app en la otra
  (un Flash Promo o un pedido "listo" aparecen en vivo en el teléfono).

## Conectar Supabase

Con credenciales en `.env.local` la app deja el Modo Demo y usa Supabase: login por email
(magic link), datos con RLS, Realtime y Storage.

1. Creá un proyecto en [Supabase](https://supabase.com) y ejecutá en el **SQL Editor**:
   - `supabase/schema.sql` (tablas, RLS, RPCs, triggers, realtime, storage);
   - opcional: `supabase/seed.sql` (evento de prueba `/join/bresh-sabado`, menú y regla de QR).
2. `cp .env.example .env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → API).
3. **Authentication → URL Configuration**: Site URL = tu dominio (o `http://localhost:3000`) y agregá
   `http://localhost:3000/**` a Redirect URLs. El proveedor Email viene habilitado por defecto.
4. Ingresá en `/login`, completá el onboarding y entrá con `/join/bresh-sabado` (o creá tu propio evento
   en `/admin/events`: quien crea un evento queda como dueño/a). El dueño/a suma al equipo por @usuario en
   **Eventos → Equipo del evento** (producción, barra, mozo/a, seguridad); cada uno entra por `/login` → Equipo y
   va directo a su pantalla. Para operar el evento del seed con tu cuenta, ver el comentario al inicio de
   `supabase/seed.sql`.
5. (Opcional) Programá `select public.purge_expired_pins()` con pg_cron cada 5 min.

> En producción: configurá un SMTP propio en Supabase (el de prueba tiene un límite bajo de emails por hora).

### Test de integración contra Supabase

Con un Supabase de prueba (local con `supabase start` o un proyecto de staging) que tenga
`schema.sql` + `seed.sql` aplicados:

```bash
SUPABASE_TEST_URL=http://localhost:54321 \
SUPABASE_TEST_ANON_KEY=<anon key> SUPABASE_TEST_SERVICE_KEY=<service role key> \
npm run test:integration
```

Recorre el flujo completo con usuarios reales: perfiles, ingreso por código maestro / de 1 uso / de
Squad, matches y chat, pines privados, rescate, bloqueos por teléfono, Rompehielos con trago, Barra
Express y comandas, Text Blasts, sorteos, CRM, roles del equipo (barra / seguridad), Storage y Realtime.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción (activa el Service Worker) |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Tests del motor de reglas y del contrato cliente ↔ `schema.sql` |

Arquitectura, reglas de negocio y sistema de diseño: ver [`CLAUDE.md`](./CLAUDE.md).
