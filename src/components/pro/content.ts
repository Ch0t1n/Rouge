/**
 * Contenido de ROUGE PRO (/pro). Todo lo que se promete acá existe en la plataforma; lo que todavía no, va con
 * `soon: true` y se muestra como "Próximamente" (nunca se vende como disponible).
 */
export interface ProNavLink {
  id: string;
  label: string;
}

export const PRO_NAV: ProNavLink[] = [
  { id: "organizadores", label: "Organizadores" },
  { id: "asistentes", label: "Asistentes" },
  { id: "networking", label: "Networking & Salas" },
  { id: "acceso", label: "Control de Acceso" },
  { id: "privacidad", label: "Seguridad & Privacidad" },
  { id: "casos", label: "Casos de Uso" },
];

export interface ProPoint {
  text: string;
  soon?: boolean;
}

/** Para quién es cada ventaja: nunca se mezclan en la misma grilla. */
export type ProAudience = "organizers" | "attendees";

export interface ProModule {
  id: string;
  title: string;
  text: string;
  points: ProPoint[];
  /** Tamaño en la grilla (desktop): columnas que ocupa de 6. */
  span: 2 | 3 | 4 | 6;
  icon: "access" | "meetings" | "map" | "leads" | "comms" | "privacy" | "analytics" | "profile" | "agenda" | "chat";
  tone: "cobalt" | "gold" | "emerald";
}

/** Ventajas para QUIEN ORGANIZA (dirección del evento, producción, sponsors). */
export const PRO_ORGANIZER_MODULES: ProModule[] = [
  {
    id: "acceso",
    icon: "access",
    tone: "cobalt",
    span: 4,
    title: "Acreditación y control de acceso sin fricción",
    text: "Un pase digital con QR de un solo uso por invitado. Tu staff lo escanea con su celular y ve foto, nombre y categoría al instante; los pases anulados, duplicados o de otro evento se rechazan solos.",
    points: [
      { text: "Escáner con la cámara del celular del staff" },
      { text: "Categorías por pase: VIP, Prensa, Speaker, Sponsor" },
      { text: "Lista de invitados por panel, CSV o API de tu sistema de registro" },
      { text: "Contador de personas adentro en tiempo real" },
    ],
  },
  {
    id: "analytics",
    icon: "analytics",
    tone: "emerald",
    span: 2,
    title: "Centro de comando y analítica",
    text: "Acreditación, reuniones y ocupación de salas en vivo, y el CRM de asistentes con empresa, cargo e intereses.",
    points: [{ text: "Export CSV de asistentes y leads" }, { text: "Reporte ejecutivo en PDF", soon: true }],
  },
  {
    id: "leads",
    icon: "leads",
    tone: "gold",
    span: 2,
    title: "Leads para sponsors y expositores",
    text: "Contactos calificados por lo que cada asistente busca y ofrece, activaciones con QR Drops y datos exportables para el CRM del sponsor.",
    points: [{ text: "Leads exportables" }, { text: "Mapa de calor por stand", soon: true }],
  },
  {
    id: "comms",
    icon: "comms",
    tone: "cobalt",
    span: 2,
    title: "Comunicaciones segmentadas",
    text: "Avisos en vivo dentro de la app y en la pantalla del evento: recordatorio de keynote, cambio de sala, invitación al cóctel VIP.",
    points: [{ text: "Segmentados por grupo, sector o perfil" }, { text: "Campañas por SMS y WhatsApp", soon: true }],
  },
  {
    id: "roles",
    icon: "privacy",
    tone: "emerald",
    span: 2,
    title: "Equipo con permisos por rol",
    text: "Dirección, producción, seguridad y barra ven solo lo que su rol necesita. Salas, mesas y cupos se configuran desde el panel.",
    points: [{ text: "Reglas aplicadas en la base de datos" }, { text: "Registro de auditoría", soon: true }],
  },
];

/** Ventajas para QUIEN ASISTE (participantes, expositores, speakers). */
export const PRO_ATTENDEE_BENEFITS: ProModule[] = [
  {
    id: "matchmaking",
    icon: "meetings",
    tone: "gold",
    span: 3,
    title: "Saben con quién hablar",
    text: "Recomendaciones por lo que cada uno busca y ofrece, y su rubro. Piden una reunión 1 a 1 con horario y sala, y al aceptar se abre el chat.",
    points: [{ text: "Reuniones con sala, mesa o pin" }, { text: "Agenda personal sin superposiciones" }],
  },
  {
    id: "map",
    icon: "map",
    tone: "emerald",
    span: 3,
    title: "No se pierden en el predio",
    text: "Plano interactivo con auditorios, stands, salas y coffee. Cada reunión aparece en el mapa y pueden marcar dónde están para su equipo.",
    points: [{ text: "Pines de ubicación que vencen solos" }, { text: "Punto de encuentro del equipo" }],
  },
  {
    id: "profile",
    icon: "profile",
    tone: "cobalt",
    span: 2,
    title: "Perfil profesional en 1 minuto",
    text: "Entran con el QR de su invitación, sin descargar nada. Su perfil personal nunca aparece en un evento de trabajo.",
    points: [{ text: "App web instalable" }],
  },
  {
    id: "agenda",
    icon: "agenda",
    tone: "gold",
    span: 2,
    title: "Agenda y avisos en vivo",
    text: "La charla actual y la siguiente, cambios de sala y anuncios del organizador, sin buscar en el mail.",
    points: [{ text: "Notificaciones dentro de la app" }],
  },
  {
    id: "privacy",
    icon: "privacy",
    tone: "emerald",
    span: 2,
    title: "Controlan sus datos",
    text: "Deciden qué se ve antes y después de una reunión. Teléfono, email y fecha de nacimiento nunca se muestran.",
    points: [{ text: "Modo incógnito cuando lo necesitan" }],
  },
];

export interface ProUseCase {
  id: string;
  label: string;
  title: string;
  text: string;
  points: ProPoint[];
  metric: { value: string; label: string };
}

export const PRO_USE_CASES: ProUseCase[] = [
  {
    id: "summits",
    label: "Congresos y cumbres",
    title: "Agenda, rondas de negocios y control de aforo",
    text: "Los asistentes llegan con reuniones agendadas en salas con cupo y siguen la agenda de charlas en vivo, con avisos de cambio de sala.",
    points: [{ text: "Agenda en vivo: charla actual y la siguiente" }, { text: "Rondas de negocios con salas y horarios" }, { text: "Asistencia real acreditada en puerta" }, { text: "Preguntas al orador con votos", soon: true }],
    metric: { value: "1 a 1", label: "reuniones con sala asignada" },
  },
  {
    id: "expos",
    label: "Ferias y exposiciones",
    title: "Stands conectados con los visitantes correctos",
    text: "Expositores y visitantes se encuentran por lo que buscan y ofrecen. Cada reunión queda en el plano del predio y cada contacto, en el CSV del expositor.",
    points: [{ text: "Plano con stands, salas y coffee" }, { text: "Categorías de pase: Expositor, Visitante, VIP" }, { text: "Leads exportables por contacto aceptado" }, { text: "Mapa de calor por stand", soon: true }],
    metric: { value: "CSV", label: "de leads para cada sponsor" },
  },
  {
    id: "offsites",
    label: "Eventos internos y offsites",
    title: "Toda la empresa conectada, y cuidada",
    text: "Equipos en el plano, barra y catering sin fila, sorteos y avisos internos. Con botón de rescate y \"Llegué a casa\" para la fiesta de cierre.",
    points: [{ text: "Equipos y mesas con punto de encuentro" }, { text: "Barra y catering con pedidos desde el celular" }, { text: "Sorteos y anuncios en vivo" }, { text: "Rescate y aviso de llegada a casa" }],
    metric: { value: "0", label: "filas en la barra del cóctel" },
  },
  {
    id: "coworks",
    label: "Coworks y comunidades",
    title: "Una comunidad que se conoce de verdad",
    text: "El directorio del encuentro, reuniones en las salas del espacio y contactos que quedan después del evento. Cada after-office se duplica como nueva edición en un clic.",
    points: [{ text: "Directorio de miembros por afinidad de negocio" }, { text: "Reserva de salas con cupo" }, { text: "Nueva edición del evento con un clic" }, { text: "Pases recurrentes para miembros", soon: true }],
    metric: { value: "∞", label: "los contactos no vencen" },
  },
];
