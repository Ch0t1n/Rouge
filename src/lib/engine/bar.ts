/** Helpers de presentación de la Barra Express (sin reglas de negocio). */
import type { BarOrder, DeliveryType } from "@/lib/types";

export const DELIVERY_META: Record<DeliveryType, { label: string; emoji: string; hint: string }> = {
  pin_delivery: { label: "Delivery a tu pin / Mesa VIP", emoji: "🛵", hint: "El mozo ve tu ubicación en el plano" },
  fast_pickup: { label: "Fast-Pickup por QR", emoji: "⚡", hint: "Sin fila: te avisamos cuando esté listo" },
  squad_split: { label: "Vaquita de Squad", emoji: "🐮", hint: "Se divide entre los integrantes" },
  icebreaker_gift: { label: "Trago Rompehielos", emoji: "🍸", hint: "Se regala desde un Rompehielos" },
};

export const STATUS_META: Record<BarOrder["status"], { label: string; tone: "muted" | "vip" | "squad" | "rouge" }> = {
  pending: { label: "Recibido", tone: "muted" },
  preparing: { label: "En preparación", tone: "vip" },
  ready_qr: { label: "¡Listo para retirar!", tone: "squad" },
  delivering: { label: "En camino a tu pin", tone: "squad" },
  completed: { label: "Entregado", tone: "muted" },
};

export const orderQrValue = (o: BarOrder) => `ROUGE:ORDER:${o.id}:${o.pickup_code ?? ""}`;
