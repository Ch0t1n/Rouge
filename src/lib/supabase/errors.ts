/**
 * Traduce los errores de Supabase (excepciones de las RPC en schema.sql,
 * violaciones de RLS/constraints) a mensajes para el usuario.
 * Nunca revela bloqueos: "unavailable" → mensaje genérico.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Tu sesión expiró. Volvé a ingresar.",
  // [v1.10] Ficha ejecutiva, categorías y zonas
  zone_not_found: "Esa zona no existe o está desactivada.",
  too_many_zones: "Hasta 20 zonas por evento.",
  event_zones_name_uq: "Ya hay una zona con ese nombre.",
  personas_bio_len_chk: "La bio profesional tiene un máximo de 240 caracteres.",
  // [v1.8] Privacidad y reuniones
  checkin_required: "En este evento el networking es para quienes ya se acreditaron en la puerta.",
  pin_squad_only: "Elegiste compartir tu ubicación solo con tu Squad: sacá a los matches o cambialo en Privacidad.",
  match_required: "En la noche, los puntos de encuentro son solo con tus matches.",
  meeting_pending: "Ya hay una reunión pendiente entre ustedes: respondela o esperá la respuesta.",
  too_many_requests: "Tenés 10 pedidos de reunión sin respuesta: esperá que te contesten.",
  invalid_time: "Elegí un horario dentro del evento (y que todavía no haya pasado).",
  invalid_duration: "La reunión dura 15 o 30 minutos.",
  invalid_spot: "Ese lugar ya no está disponible.",
  spot_busy: "Ese lugar ya está ocupado en ese horario: elegí otro horario u otra sala.",
  invalid_pin: "Marcá el punto dentro del plano.",
  invalid_location: "Elegí dónde se encuentran.",
  time_conflict: "Ese horario se superpone con otra reunión confirmada.",
  meeting_expired: "Esa reunión ya pasó.",
  // [v1.7] Verticales y perfiles adicionales
  invalid_mood: "Ese mood no corresponde a este evento: elegí uno de la lista.",
  persona_required: "Para este evento necesitás un perfil profesional.",
  invalid_persona: "Ese perfil no es para este tipo de evento.",
  kind_locked: "No se puede cambiar el tipo de evento: ya entró gente con perfiles y moods de este tipo.",
  not_in_vertical: "Esta función no está disponible en este tipo de evento.",
  persona_in_use: "Estás usando este perfil en un evento en curso: cambialo desde el evento antes de borrarlo.",
  too_many_personas: "Podés tener hasta 5 perfiles además del principal.",
  personas_pro_chk: "Contá tu cargo o tu empresa y elegí algo que buscás u ofrecés.",
  invalid_code: "Código o link inválido.",
  lobby_not_open: "El lobby todavía no abrió.",
  lobby_expired: "Este lobby ya cerró.",
  lobby_closed: "El lobby de este evento ya cerró.",
  code_already_used: "Este código ya fue utilizado.",
  event_full: "El evento alcanzó su cupo máximo en la app.",
  not_attendee: "No estás en este evento.",
  unavailable: "Este perfil no está disponible.",
  already_matched: "Ya hicieron match.",
  sender_in_ghost_mode: "Estás en Modo Solo Amigos. Desactivalo para conectar con gente nueva.",
  icebreaker_already_used: "Ya usaste tu Rompehielos de esta noche.",
  invalid_message: "Revisá el mensaje (máximo 140 caracteres).",
  receiver_only_accepts_liked: "Esta persona solo recibe Rompehielos de gente a la que conectó primero.",
  invalid_item: "Ese ítem no está disponible.",
  not_allowed: "No podés hacer esto ahora.",
  already_in_squad: "Ya estás en un Squad para este evento.",
  not_member: "No sos parte de este Squad.",
  no_squad: "Necesitás un Squad para esto.",
  no_base_pin: "Primero fijá un Punto Base en el plano.",
  choose_audience: "Elegí con quién compartir tu pin.",
  forbidden: "Tu rol no tiene permiso para esto.",
  staff_user_not_found: "No encontramos a nadie con ese @usuario.",
  staff_is_creator: "Quien creó el evento siempre es dueño/a.",
  already_drawn: "Este sorteo ya tiene ganador.",
  no_participants: "No hay participantes que cumplan el filtro.",
  invalid_qr: "QR inválido.",
  already_redeemed: "Este QR ya fue canjeado.",
  use_send_icebreaker: "El trago rompehielos se envía desde un Rompehielos.",
  empty_order: "El pedido está vacío.",
  pin_required: "Para delivery necesitás un pin activo en el plano.",
  squad_required: "La Vaquita requiere un Squad.",
  not_found: "No lo encontramos.",
  final_status: "Ese pedido ya está en su estado final.",
  already_delivered: "Ese pedido ya fue entregado.",
  not_ready: "El pedido todavía no está listo para retirar.",
  invalid_count: "Generá entre 1 y 1000 códigos por lote.",
  ig_not_connected: "Conectá tu Instagram primero.",
  ig_token_invalid: "Tu conexión con Instagram venció. Volvé a conectarla.",
  ig_api_error: "Instagram no respondió. Probá en un rato.",
  not_paid: "El pedido todavía no está pago.",
  split_not_member: "Solo podés compartirlo con integrantes de tu Squad.",
  split_required: "Elegí con quién lo compartís.",
  invalid_expense: "Contá en qué fue el gasto (máximo 60 caracteres).",
  invalid_amount: "Ingresá un monto válido.",
  invalid_settlement: "No te podés transferir a vos.",
  already_confirmed: "Esa transferencia ya está confirmada.",
  brand_not_owned: "Esa marca no es de quien creó el evento.",
  not_online_payment: "Este pedido se paga en la barra.",
  amount_mismatch: "El monto pagado no coincide con el pedido.",
  mp_not_configured: "Los cobros con Mercado Pago todavía no están activados en este sitio.",
  mp_token_invalid: "La conexión con Mercado Pago venció. Volvé a conectarla.",
  mp_not_connected: "La marca no tiene Mercado Pago conectado.",
  mp_api_error: "Mercado Pago no respondió. Probá en un rato.",
  banned: "No podés entrar a este evento.",
  not_promoter: "Esa persona no es RRPP de este evento: sumala al equipo con el rol RRPP.",
  is_staff: "No podés expulsar a alguien del equipo: primero sacalo del equipo.",
  event_has_attendees: "Ya entró gente a este evento: no se puede eliminar (sus matches y chats se conservan). Podés cerrar el lobby desde el editor.",
  event_has_payments: "Este evento tiene cobros registrados con Mercado Pago: no se puede eliminar.",
};

export interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export function friendlyError(e: unknown): string {
  const err = (e ?? {}) as SupabaseLikeError;
  const msg = err.message ?? String(e ?? "");
  if (MESSAGES[msg]) return MESSAGES[msg];
  // Postgres: unique_violation / check_violation / RLS
  // FK de una sala con reuniones (venue_spots → meetings, on delete restrict)
  if (err.code === "23503" && /venue_spots|meetings/.test(msg + (err.details ?? ""))) return "Ese lugar ya tiene reuniones: desactivalo en vez de borrarlo.";
  if (err.code === "23505") {
    if (/username/.test(msg + (err.details ?? ""))) return "Ese @username ya está en uso.";
    if (/phone/.test(msg + (err.details ?? ""))) return "Ese teléfono ya está asociado a otra cuenta.";
    return "Eso ya existe.";
  }
  if (err.code === "23514") {
    if (/personas_pro_chk/.test(msg)) return MESSAGES.personas_pro_chk;
    return "Algún dato no es válido. Revisalo e intentá de nuevo.";
  }
  if (err.code === "42501" || /row-level security/i.test(msg)) return "No tenés permiso para hacer esto.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return "Sin conexión con el servidor. Probá de nuevo con mejor señal.";
  return "Algo salió mal. Probá de nuevo.";
}
