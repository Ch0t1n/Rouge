/**
 * Traduce los errores de Supabase (excepciones de las RPC en schema.sql,
 * violaciones de RLS/constraints) a mensajes para el usuario.
 * Nunca revela bloqueos: "unavailable" → mensaje genérico.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Tu sesión expiró. Volvé a ingresar.",
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
  if (err.code === "23505") {
    if (/username/.test(msg + (err.details ?? ""))) return "Ese @username ya está en uso.";
    if (/phone/.test(msg + (err.details ?? ""))) return "Ese teléfono ya está asociado a otra cuenta.";
    return "Eso ya existe.";
  }
  if (err.code === "23514") return "Algún dato no es válido. Revisalo e intentá de nuevo.";
  if (err.code === "42501" || /row-level security/i.test(msg)) return "No tenés permiso para hacer esto.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return "Sin conexión con el servidor. Probá de nuevo con mejor señal.";
  return "Algo salió mal. Probá de nuevo.";
}
