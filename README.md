# ROUGE

**La noche, conectada.** PWA social y operativa para eventos, fiestas y discotecas (B2B2C):
lobby privado por evento, grilla por afinidad musical, Rompehielos, Squads con botón de rescate,
plano interactivo con pines de 15 minutos, perks/QR, Barra Express y suite B2B para organizadores.

## Arranque rápido

```bash
npm install
npm run dev
# → http://localhost:3000
```

Sin credenciales de Supabase la app arranca en **Modo Demo**: un evento en vivo
("ROUGE Night × Bresh Sábado"), 13 asistentes, un Squad activo, matches, rompehielos,
pines en el plano, QRs y pedidos de barra precargados. Todo persiste en `localStorage`.

- Tocá tu avatar arriba a la derecha para **actuar como** otra persona.
- Abrí una **segunda pestaña** para simular otro teléfono: los cambios se sincronizan.
- `/admin` abre el panel del organizador en vista expandida.

## Conectar Supabase

1. Creá un proyecto en Supabase y ejecutá `supabase/schema.sql` en el SQL Editor.
2. `cp .env.example .env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. (Opcional) Programá `select public.purge_expired_pins()` con pg_cron cada 5 min.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción (activa el Service Worker) |
| `npm run typecheck` | Verificación de tipos |
| `npm test` | Tests del motor de reglas de negocio |

Arquitectura, reglas de negocio y sistema de diseño: ver [`CLAUDE.md`](./CLAUDE.md).
