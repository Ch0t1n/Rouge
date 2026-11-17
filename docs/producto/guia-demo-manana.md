# Guía: demo gratuita para un potencial cliente

Checklist de un día para mostrarle Rouge Pass a un dueño/a de boliche o productora y cerrar un **primer evento
gratis**. El guion completo está en [Demo comercial](demo-comercial.md); acá va qué hacer, en qué orden y qué decir.

---

## 0. La noche anterior (30 min)

### Poner la versión nueva en el sitio de demo

`demo.rougepass.com` muestra la rama `main`, que **todavía no tiene** la v1.7–v1.8 (puerta con QR en vivo, `/ops`,
consola global, creador de eventos con módulos, Wrapped, Mesa VIP dividida…). Hay dos opciones:

| Opción | Qué pasa | Riesgo |
|---|---|---|
| **A. Promover el preview a producción en `rouge-demo`** (recomendada) | Vercel → proyecto `rouge-demo` → Deployments → el último de `claude/pensive-tesla-ezba23` en estado *Ready* → ⋯ → **Promote to Production**. `demo.rougepass.com` pasa a mostrarlo. | Ninguno para el sitio real: `rouge-demo` no tiene Supabase (Modo Demo). Se deshace con *Instant Rollback*. |
| B. Mergear a `main` | Actualiza demo **y** `rougepass.com` (proyecto `rouge`, con Supabase). | **Alto:** la base de producción no tiene las RPCs/tablas nuevas de `schema.sql`; partes de `rougepass.com` fallarían hasta migrar. No hacerlo antes de la demo. |

Si preferís no tocar Vercel, el preview de la rama ya funciona, pero pide login de Vercel (protección de previews):
sirve para vos, no para dejarle el link al cliente.

### Probar el recorrido completo una vez

1. Abrir `https://demo.rougepass.com/demo` (entrar por `/demo` es lo que habilita personas, "Simular…" y badges demo).
2. **Reiniciar demo** → abrir **Modo presentador** y pasar los 7 pasos con ←/→.
3. Verificar: QR del pase que cambia cada 20 s, comanda que entra en `/ops/bar`, rescate que aparece en Seguridad,
   Pantalla LED en otra pestaña.

### Preparar materiales

- Las piezas de `marketing/organizadores/` (01–07, 1080×1350) en el celular, para mandar por WhatsApp al terminar.
- Una propuesta de 1 página con la oferta del piloto (ver §4) en PDF o en el celular.
- Averiguar del cliente: capacidad, cuántas barras, si usa ticketera y cuál, si trabaja con RRPP y si hace listas free.
  Con eso elegís el **preset** que vas a mostrar en el paso 6.

---

## 1. Antes de la reunión (15 min)

- [ ] Notebook cargada + cargador; celular cargado. Adaptador HDMI si hay TV.
- [ ] Datos móviles como respaldo del Wi-Fi del lugar (la demo es 100 % web).
- [ ] En la notebook, Chrome en ventana limpia: `demo.rougepass.com/demo` → **Reiniciar demo** → **Modo presentador**.
- [ ] Segunda pestaña: **Pantalla LED** (para mandar a la TV en el paso 5).
- [ ] En el celular: `demo.rougepass.com/demo` → *Abrir como Asistente* (Sofía). Sirve para que el cliente "toque" la app.
- [ ] Zoom del navegador al 100 %, notificaciones del sistema silenciadas, pestañas personales cerradas.
- [ ] Tener a mano los PIN del kiosco: **Daniela 4826 · Marta 7391 · Nicolás 5150**.

> **Limitación a recordar:** en Modo Demo el tiempo real funciona **entre pestañas del mismo navegador**, no entre la
> notebook y tu celular. Lo sincronizado se muestra en el Modo presentador (teléfono + panel lado a lado). El celular
> es para que lo toquen, no para mostrar la sincronización.

---

## 2. Guion (10–12 min)

Abrí con preguntas, no con la app: *"¿Cuánta gente se te va de la fila de la barra? ¿Sabés quién vino el sábado
pasado y cómo volver a escribirle?"*. Después seguí los pasos del Modo presentador:

| # | Paso | Qué mostrar | Frase clave |
|---|---|---|---|
| 1 | El problema | Resumen del panel | "Hoy no sabés quién entró, cuánto gastó ni cómo volver a traerlo." |
| 2 | La puerta | Link maestro + QR; en el teléfono, el pase con **QR que cambia cada 20 s**. Panel → `/ops/door` (Seguridad/Nicolás) escanea | "Una captura de pantalla no entra. Y si se corta internet, la puerta sigue con el padrón cifrado." |
| 3 | Conectar | Lobby por afinidad → Conectar → match → chat; Rompehielos con trago de regalo | "La gente se queda más y vuelve porque conoció a alguien." |
| 4 | Seguridad | Squad → 🚨 Rescate; panel como Seguridad: alerta con ubicación en el plano | "Nadie pierde a su grupo. Eso lo valoran los padres y las chicas." |
| 5 | La plata | Pedido en Barra Express → `/ops/bar` (Daniela) → Listo → aviso al teléfono. Mandar la **Pantalla LED** a la TV | "Ventas sin fila, ticket promedio y filas evitadas, en vivo." |
| 6 | Fidelizar | Text Blast a Squads de 4+, sorteo en la LED, CRM con Smart Tags, campaña por WhatsApp, **Wrapped** | "El lunes le escribís a los que gastaron más, por WhatsApp, en dos clics." |
| 7 | Datos y cierre | Resumen + tablero de 15' contra el promedio. Luego la oferta (§4) | "El primer evento lo hacemos juntos y gratis." |

### Extra para cerrar: "armalo a tu medida" (2 min)

Abrir como **ROUGE HQ** (`/superadmin` → *Creador de eventos*) y crear el evento del cliente en vivo, con su nombre,
fecha y capacidad. Elegir el preset que le sirve:

- 🎉 **Fiesta Completa** — boliche grande con todo.
- 🎟️ **Solo Ticketera + Puerta** — si ya tiene barra resuelta y le duele la puerta / RRPP.
- 🍸 **Solo Barra Express + QR Drops** — si el dolor son las filas.
- 🥂 **Bar / Previa Social** — bares sin puerta.
- 🏢 **Evento Privado / Corporativo** — empresas, sin lobby de citas.

Mostrar que, al apagar un módulo, desaparece de la app del asistente y del panel. *"Pagás y ves solo lo que usás."*

Si trabaja con RRPP: `/admin/rrpp` (comisión escalonada y % de barra, liquidación CSV). Si hace listas free: la puerta
cobra el diferencial pasada la hora límite.

---

## 3. Objeciones frecuentes

| Objeción | Respuesta |
|---|---|
| "La gente no se baja apps." | No se baja nada: es una web que se abre con el QR de la entrada (PWA). |
| "Ya tengo ticketera." | Se integra por API: la ticketera emite un código por entrada y nosotros lo validamos en puerta. |
| "¿Y si se cae internet?" | La puerta trabaja offline con padrón cifrado y reconcilia al volver la señal. |
| "¿Cómo cobro?" | Mercado Pago a nombre de la marca: la plata entra directo a su cuenta. |
| "Privacidad / menores." | +18 obligatorio, teléfono nunca visible a otros, bloqueo mutuo, borrado de cuenta. |
| "¿Mis empleados pueden robar datos?" | Cada rol ve solo lo suyo; acceso con horario, kill switch, kiosco con PIN y auditoría. |
| "¿Cuánto cuesta?" | El primer evento, nada. Después: fee por evento, por asistente activo o comisión de barra/VIP (según su caso). |

> No prometer en la reunión: facturación ARCA, lista de espera, entradas propias ni seña de Mesa VIP (están en el
> roadmap, ver [competencia](competencia.md)).

---

## 4. La oferta del piloto gratis

- **Qué damos:** un evento completo sin costo, configuración del evento y su marca (logo y colores), códigos/QR,
  capacitación de 30 min al equipo (puerta, barra, seguridad) y acompañamiento esa noche.
- **Qué pedimos:** acceso a las métricas del evento, un **testimonio** (texto o video corto) y permiso para usar el
  caso con su marca.
- **Para fijar ya en la reunión:** fecha del evento, preset de módulos, responsable del lado del cliente y fecha de la
  capacitación (idealmente 3–5 días antes).

---

## 5. Después de la reunión (mismo día)

- [ ] WhatsApp de agradecimiento con las piezas de `marketing/organizadores/` y el link de la demo (botón *Compartir*
      en `/demo`, que también genera el QR).
- [ ] Resumen escrito: fecha del piloto, preset, qué se configura y qué necesitás de ellos (logo, colores, menú y
      precios de la barra, lista de equipo y RRPP).
- [ ] Si dice que sí, el piloto corre en **producción con Supabase**: antes de esa fecha hay que migrar `schema.sql` y
      seguir [la guía de producción paso a paso](../operaciones/guia-produccion-paso-a-paso.md) y el
      [checklist de lanzamiento](../operaciones/checklist-lanzamiento-v1.md). Dejar al menos una semana.

---

## Plan B si algo falla en vivo

- **La página no carga:** datos del celular como hotspot; si no, mostrar las capturas de `public/landing/` y las
  piezas de `marketing/organizadores/`.
- **Datos raros después de probar mucho:** menú de persona → **Reiniciar demo**.
- **Te pide PIN un kiosco:** usar los de §1.
- **Una sección dice "Módulo desactivado":** el evento activo tiene ese módulo apagado (por ejemplo, el que creaste en
  el paso extra). Cambiar al evento de demo desde el selector o reiniciar.
