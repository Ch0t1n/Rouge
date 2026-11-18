# Skills del proyecto (Claude Code)

Claude Code carga solo las carpetas de `.claude/skills/<nombre>/SKILL.md`. Se activan cuando el pedido coincide
con su `description`, o a mano con `/<nombre>`.

## Procedencia

- Origen: [rampstackco/claude-skills](https://github.com/rampstackco/claude-skills), licencia MIT
  (ver `LICENSE-rampstack`).
- Commit importado: `059051082ab0c1dc02d271506d7318eca6b55f51` (2026-11-08).
- Se copiaron **14 de 109** skills, solo `SKILL.md` + `references/`. No se copiaron los README de cada skill
  (eran marketing), ni scripts, hooks, plugins ni `dist/`.
- Revisión de seguridad hecha al importar: el texto no tiene caracteres Unicode invisibles ni comentarios HTML;
  no hay `allowed-tools`, hooks, comandos `curl | sh`, instalaciones globales ni pedidos de enviar datos afuera.
  Los únicos comandos son de ejemplo (`npm audit`, `npm ls`, `curl -I` a dominios de ejemplo) y no se ejecutan
  solos.

## Skills incluidas y para qué sirven en ROUGE

| Skill | Usarla para |
|---|---|
| `code-review-web` | Revisar PRs y diffs, debuggear builds y errores en producción (incluye patrones de Next.js App Router). |
| `security-baseline` | Headers (CSP, HSTS, etc.), secretos, endurecer antes de lanzar. |
| `accessibility-audit` | Auditoría WCAG 2.1 AA de flujos completos (onboarding, lobby, rescate, barra). |
| `performance-optimization` | Core Web Vitals, peso del bundle, imágenes y fuentes, experiencia con mala señal. |
| `qa-testing` | Smoke, standard o full después de un cambio o antes de un evento. |
| `test-case-authoring` | Plan de tests trazado a criterios de aceptación (unitario, contrato, integración, E2E). |
| `frontend-component-build` | Componentes nuevos o refactorizados en `src/components` (estados, API, a11y). |
| `design-standards` | Revisión visual diaria: tokens, contraste, jerarquía, mobile, áreas táctiles. |
| `design-system` | Auditar o ampliar el sistema "Velvet & Laser" (`tailwind.config.ts`, `components/ui`). |
| `form-strategy` | Formularios: login, join, perfil, eventos de admin, blasts. |
| `onboarding-wizard-design` | El onboarding de 4 pasos y el camino hasta el primer match. |
| `media-asset-management` | Fotos, loops y capturas: compresión, Storage, IndexedDB, imágenes adaptables. |
| `dependency-management` | Agregar, actualizar o auditar paquetes de npm. |
| `monitoring-and-alerting` | Qué monitorear en producción y en la noche del evento (SLOs, alertas, guardia). |

Algunas skills mencionan otras que **no** se importaron (`pm-spec-writing`, `incident-response`,
`brand-identity`, `seo-technical`, `after-action-report`…). Si hace falta una, se importa siguiendo la política
de abajo; mientras tanto se ignora la referencia.

## Política para agregar o actualizar skills

1. Clonar el repo de origen en un directorio temporal, nunca dentro de este proyecto.
2. Leer el `SKILL.md` completo y escanear `references/`: caracteres invisibles, comentarios HTML, URLs,
   comandos de shell, `allowed-tools`, hooks y cualquier instrucción de subir datos, saltear tests o tocar
   credenciales.
3. No importar skills que traigan scripts ejecutables o hooks, salvo que se revisen línea por línea.
4. Actualizar el commit importado y la tabla de este archivo, y la sección "Skills" de `CLAUDE.md`.
