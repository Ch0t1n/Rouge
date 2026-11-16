/**
 * Textos de la landing pública que también usa el servidor (JSON-LD de `src/app/page.tsx`).
 * Módulo plano, sin "use client": lo importan tanto las secciones como la página.
 * Palabras clave (es-AR): app para fiestas, app para boliches, conocer gente en una fiesta,
 * no perder a tus amigos en el boliche, pedir tragos sin hacer fila, dividir la cuenta.
 */

export const SEO = {
  title: "App para fiestas y boliches | ROUGE, la noche conectada",
  description:
    "Entrá al lobby privado de tu fiesta con tu entrada: conocé gente que escucha tu música, encontrá a tu grupo en el plano y pedí tragos sin hacer fila.",
  ogTitle: "ROUGE — La app de tu fiesta",
  ogDescription: "Conocé gente afín, no pierdas a tu grupo en el boliche y pedí en la barra sin filas. Entrás con tu entrada, sin descargar nada.",
} as const;

/** Preguntas del público (landing "/"): nada de planes, CRM ni ventas. También salen como FAQPage en el JSON-LD. */
export const FAQ_PUBLIC = [
  {
    q: "¿Qué es ROUGE?",
    a: "Es la app para fiestas, boliches y discotecas que se abre con el link o el QR de tu entrada. En el lobby privado del evento conocés gente afín por tu música, armás tu Squad para no perder a tu grupo, te ubicás en el plano del lugar y pedís tragos sin hacer fila.",
  },
  {
    q: "¿Es una app de citas?",
    a: "No. Es la app de la fiesta: sirve para conocer gente que va al mismo evento, pero también para cuidar a tu grupo, ubicarte adentro del lugar y pedir en la barra. Conectar es siempre mutuo y el lobby se cierra cuando termina la noche.",
  },
  { q: "¿Tengo que descargar una app?", a: "No. ROUGE funciona en el navegador: abrís el link o el QR de tu entrada y listo. Si querés, la agregás a la pantalla de inicio." },
  { q: "¿ROUGE es gratis?", a: "Sí: para vos no cuesta nada, lo pone la fiesta. Solo pagás lo que pidas en la barra, como siempre (y sin hacer fila)." },
  {
    q: "¿En qué fiestas funciona?",
    a: "En las fiestas, boliches y eventos que usan ROUGE: si la tuya lo tiene, el link viene con tu entrada o te lo dan en la puerta. Si te gustaría tenerlo, contale al organizador.",
  },
  { q: "¿Quién ve mi número de teléfono?", a: "Ningún otro asistente. Y si bloqueás un número, nunca te revelamos si esa persona tiene cuenta." },
  {
    q: "¿Cómo encuentro a mis amigos adentro del boliche si no hay GPS?",
    a: "Con el Pin-Drop: tocás el plano real del lugar y tu pin dura 15 minutos. Lo ven solo tu Squad y los Matches que elijas. Si se separan, el Punto Base marca dónde reencontrarse.",
  },
  {
    q: "¿Qué pasa cuando termina la fiesta?",
    a: "Efecto Cenicienta: el lobby, el plano y los Squads se cierran a la hora que fija la fiesta. Tus Matches y sus chats quedan para siempre.",
  },
  { q: "¿Puedo ir sin que me vean en la grilla?", a: "Sí: con el Modo Solo Amigos desaparecés de la grilla y te siguen viendo solo tu Squad y tus Matches." },
  {
    q: "¿Cómo divido la cuenta con mi grupo?",
    a: "Lo que comparten en la barra se suma solo a las Cuentas de la mesa; la mesa, las entradas o el taxi los cargás a mano. Al final te decimos cuánto le pasás a quién.",
  },
];
