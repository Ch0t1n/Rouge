# E2E (Playwright)

Pruebas en un navegador real contra una app **ya levantada**. Guía completa: [docs/operaciones/testing.md](../docs/operaciones/testing.md).

| Suite | Comando | App necesaria |
|---|---|---|
| `demo-*.cjs` (10 suites, incluida la demo corporativa) | `npm run e2e:demo` | Modo Demo en `E2E_BASE_URL` (default `http://localhost:3100`) |
| `supabase-flow.cjs` | `npm run e2e:supabase` | Compilada contra un Supabase de prueba + Mailpit |
| `supabase-instagram.cjs` | `npm run e2e:instagram` | Igual, con Instagram apuntando a `mocks/instagram-api.cjs` (lo levanta el runner) |

- Configuración: [`env.cjs`](env.cjs). Capturas: `e2e/.out/` (ignorada por git).
- Foto de prueba: `fixtures/photo.png`. Imágenes del feed imitado: `mocks/instagram/`.
- Las suites de Supabase crean usuarios únicos por corrida: no ensucian datos entre corridas, pero **nunca** las
  corras contra producción.
