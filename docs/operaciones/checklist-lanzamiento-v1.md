# Checklist de lanzamiento v1.0

Marcar antes del primer evento real.

## Producto

- [ ] Demo pública desplegada y probada en iPhone y Android (instalar como app incluido).
- [ ] Producción desplegada con dominio propio y HTTPS.
- [ ] Evento real creado, link maestro y códigos probados de punta a punta (entrar → mood → lobby).
- [ ] Equipo cargado con sus roles; cada persona entró una vez y vio su pantalla.
- [ ] Menú de la barra revisado (precios y disponibilidad). En la v1 se edita desde Supabase → *Table Editor* →
      `bar_menu_items` (filtrar por `event_id`); el panel todavía no tiene editor de menú.
- [ ] Reglas de QR Drop configuradas y probadas.
- [ ] Pantalla LED probada en el proyector o pantalla real del lugar.
- [ ] Hoja de QRs impresa (si se usan códigos físicos).

## Backend y operación

- [ ] `schema.sql` ejecutado en producción; `seed.sql` **no** (salvo evento de prueba).
- [ ] URLs de Auth configuradas (Site URL y Redirect URLs).
- [ ] **SMTP propio** configurado y probado (los magic links llegan en segundos).
- [ ] `pg_cron` programado para `purge_expired_pins()`.
- [ ] Backups diarios activos.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en variables del servidor; nada secreto con prefijo `NEXT_PUBLIC_`.
- [ ] Integración real (`npm run test:integration`) pasando contra staging.
- [ ] Alguien de guardia con acceso a Vercel y Supabase durante el evento.

## Login social

- [ ] Google: pantalla de consentimiento publicada, credenciales en Supabase, `NEXT_PUBLIC_AUTH_GOOGLE=1`, probado.
- [ ] Instagram: app de Meta configurada (redirect, deauthorize y data deletion), testers cargados.
- [ ] Instagram para el público: App Review aprobado (si no, dejar `NEXT_PUBLIC_AUTH_INSTAGRAM=0` y usar el @ manual).

## Legal y confianza

- [ ] Términos y condiciones y política de privacidad publicados (los piden Meta y Google).
- [ ] Inscripción de la base de datos ante la AAIP (Ley 25.326).
- [ ] Proceso de borrado de cuenta a pedido documentado (email de contacto).
- [ ] Revisión legal de los textos (edad +18, uso de ubicación, datos que ve el organizador).

## Comunicación

- [ ] Landing con el dominio final; capturas actualizadas (`node scripts/capture-landing-shots.cjs`).
- [ ] Material para redes (Reels/TikTok, carruseles) y guion de demo comercial ([ver](../producto/demo-comercial.md)).
- [ ] FAQ para asistentes ([guía](../producto/guia-asistentes.md)) y briefing para el equipo ([guía](../producto/guia-equipo.md)).

## Después del primer evento

- [ ] Exportar Resumen y CRM; medir: % que entró a la app, % en Squad, matches, ventas por la app, filas evitadas.
- [ ] Recolectar feedback del dueño, del equipo y de 10 asistentes.
- [ ] Priorizar la v1.1 con las [mejoras conocidas](../../CHANGELOG.md#pendientes-conocidos).
