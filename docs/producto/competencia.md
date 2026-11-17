# Competencia y qué nos falta (noviembre 2026)

Relevamiento de las apps con las que un organizador compara a Rouge Pass y de las funciones que ellas tienen y Rouge Pass
todavía no. Las fuentes están al final; varias comparativas son de los propios proveedores (Posh, Ticket Fairy), así
que sus números se toman como orientativos.

## Mapa de la competencia

| Categoría | Ejemplos | Qué resuelven | Qué NO resuelven (y Rouge Pass sí) |
|---|---|---|---|
| Ticketeras de música y noche | DICE, Posh, Bombo (AR), Passline, Venti, Alpogo | Venta de entradas, lista de espera, reventa segura, RRPP con comisión, SMS | Conocer gente en la fiesta, Squad y rescate, plano, barra sin fila, cuentas de la mesa |
| Invitaciones sociales | Partiful, Apple Invites | RSVP, ver quién va, lista de espera automática, entradas con niveles y códigos | Operación del boliche (barra, seguridad, LED), datos para el organizador |
| Mesas y botellas | Discotech, Tablelist, ClubPass, SevenRooms | Reservar mesa VIP con seña, comparar botellas, pagar y **dividir la cuenta** en la app, concierge | Lo que pasa en la pista: matches, Squad, pedidos al pin |
| Cashless y consumo | Lollacashless (pulsera RFID), Kicket (AR), Intellitix, Howler | Saldo precargado, pagar con pulsera o celular, datos de consumo por ítem | Social, seguridad, marca del organizador en la app |
| Gestión de boliches | Software de gestión de Mar del Plata (+50.000 usuarios), Black ID | Listas, RRPP, caja, accesos | Experiencia del asistente en el celular |

**Lo que ya nos diferencia:** grilla por afinidad musical y Rompehielos, Squad con botón de rescate y pin de 15 min,
plano en vivo, Barra Express con delivery al pin y cobro con Mercado Pago, **cuentas de la mesa** (lo que Tablelist
cobra como "split the tab", pero para todo el grupo y con transferencias mínimas), marca del organizador, Pantalla LED,
CRM con Smart Tags y API para ticketeras. Ningún competidor junta lo social, la seguridad y la operación de la barra.

## Qué falta, por prioridad

Esfuerzo: **S** días · **M** 1–2 semanas · **L** 3+ semanas.

### Prioridad 1 — lo que más pide un organizador argentino

| # | Función | Quién la tiene | Por qué importa | Esfuerzo |
|---|---|---|---|---|
| 1 | **Venta de entradas propia** (lotes/preventa, precios por tanda, códigos de descuento, cupo, Mercado Pago) | DICE, Posh, Partiful, Bombo, Passline | Hoy dependemos de la ticketera del cliente (API v1). Vender la entrada nos da el dato desde el primer minuto y una segunda línea de ingresos. La base ya está: códigos de 1 uso + Mercado Pago por marca. | L |
| 2 | **RRPP / promotores con link propio y comisión** | Posh ("Kickbacks") y el software de gestión de boliches | En la noche argentina las listas y las ventas se mueven por RRPP. Link/código por RRPP, ranking de ventas y liquidación. | M |
| 3 | **Reserva de Mesa VIP con seña y consumo mínimo** | Discotech, Tablelist, ClubPass, SevenRooms | Es el ticket más alto de la noche. Encaja con Mesa VIP + Barra Express + cuentas de la mesa. | M |
| 4 | **Facturación electrónica (ARCA)** de las ventas de la barra y de las entradas | Obligatoria para el comercio en Argentina | El ticket de la comanda hoy es un comprobante interno. Integrar un proveedor (TusFacturas, Facturante, AFIP SDK) por marca. | M |
| 5 | **Escáner con cámara** en puerta y ventanilla | Todas las ticketeras | Hoy el código se tipea o se usa un lector tipo teclado. Escanear con el celular del staff acelera la puerta. | S |

### Prioridad 2 — retención y marketing

| # | Función | Quién la tiene | Esfuerzo |
|---|---|---|---|
| 6 | **Lista de espera** automática cuando se llena el cupo (y liberación de entradas devueltas) | Partiful, DICE | S |
| 7 | **Reventa / transferencia segura** de entradas entre personas | Bombo, DICE | M |
| 8 | **Avisos fuera de la app**: notificaciones push web, WhatsApp y SMS para recordatorios y "volvé a comprar" | Posh (SMS ilimitados) | M |
| 9 | **Encuesta post-evento (NPS) y galería oficial de fotos** | Plataformas de eventos en general | S |
| 10 | **Píxel de Meta / Google Analytics y links de seguimiento por canal** para medir de dónde viene cada asistente | Posh, DICE | S |
| 11 | **Fidelidad entre eventos** (puntos, beneficios para recurrentes, "Top Spender" con perks automáticos) | Programas de marcas de nightlife | M |

### Prioridad 3 — operación del lugar

| # | Función | Esfuerzo |
|---|---|---|
| 12 | **Saldo precargado (cashless) y propinas** desde la app (la barra cobra en 1 toque, sin esperar a Mercado Pago) | M |
| 13 | **Varias barras**: cada comanda va a su barra (Central, Terraza) y se **imprime sola** en una térmica de la barra (puente local ESC/POS) | M |
| 14 | **Stock y cierre de caja** por barra y bartender (reporte Z, ítems más vendidos por hora) | M |
| 15 | **Validación de edad/identidad** en el ingreso (DNI) para venta de alcohol a +18 | M |
| 16 | **App en las tiendas** (envoltorio de la PWA) para estar en App Store / Google Play | S–M |

## Recomendación

✅ Ya hecho en la v1.6: **RRPP con link y comisión (2)** y **escáner con cámara (5)**. Sigue: **lista de espera (6)**. Son
rápidos, los pide todo organizador y suben las ventas desde la primera fiesta. Después, **entradas propias (1)** con
lotes y códigos, que convierte a Rouge Pass en la plataforma completa del evento, y la **reserva de Mesa VIP con seña (3)**.
La **facturación ARCA (4)** tiene que estar antes de cobrar volúmenes grandes con Mercado Pago.

## Fuentes

- [Discotech (App Store)](https://apps.apple.com/app/id688089181) · [Tablelist (App Store)](https://apps.apple.com/app/tablelist/id634444177) · [ClubPass (App Store)](https://apps.apple.com/us/app/-/id6753863268)
- [Posh vs DICE 2026 (Posh)](https://university.posh.vip/university/post/posh-vs-dice) · [DICE vs Posh (Ticket Fairy)](https://www.ticketfairy.com/event-ticketing/dice-vs-posh) · [Partiful lanza venta de entradas](https://smb.orangeleader.com/article/Partiful-Launches-Ticketing-Bringing-Paid-Events-Into-the-Social-Platform-Where-People-Already-Make-Plans/6a1f7d69004597ee6ba14b2d) · [Alternativas a Partiful](https://www.ticketfairy.com/compare/ticketing/partiful-alternatives)
- [Kicket (Forbes Argentina)](https://www.forbesargentina.com/innovacion/startup-argentina-empieza-operar-uruguay-objetivo-revolucionar-forma-consumo-bares-shows-eventos-n88517) · [Bombo (El Cronista)](https://www.cronista.com/finanzas-digitales/bombo-la-ticketera-blockchain-que-elimino-el-fraude-habilito-la-reventa-segura-y-levanta-fortunas) · [Lollacashless (La Nación)](https://www.lanacion.com.ar/espectaculos/como-puedo-cargar-mi-saldo-lollacashless-nid19032025/) · [Startup marplatense de gestión de noche (La Capital)](https://www.lacapitalmdp.com/el-exito-de-la-startup-marplatense-que-se-consolida-en-la-noche-y-los-eventos/) · [Black ID (Forbes Argentina)](https://www.forbesargentina.com/negocios/como-black-id-startup-entretenimiento-urbano-desembarca-buenos-aires-n12608)
- [Cashless: RFID vs app (Ticket Fairy)](https://www.ticketfairy.com/blog/cashless-payment-systems-showdown-rfid-vs-app-based-vs-token-solutions-for-festivals/) · [Cómo funcionan las pulseras cashless](https://www.wristband.com/blogs/news/how-cashless-payment-wristbands-work) · [Propinas y fintech en Argentina (BA Times)](https://www.batimes.com.ar/news/economy/argentinas-reign-of-cash-tips-nears-its-end-amid-a-fintech-boom.phtml)
