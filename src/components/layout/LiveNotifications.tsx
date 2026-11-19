"use client";

/**
 * Notificaciones en vivo (banners toast) para la persona actual.
 * Deriva "novedades" del estado y muestra las que todavía no vio.
 * En Modo Demo el estado llega desde otra pestaña vía evento `storage`;
 * con Supabase, las mismas filas llegan por Realtime y este componente no cambia.
 *
 * "Visto" se guarda por persona en localStorage (comodidad local, no crítica).
 */
import { useEffect, useRef } from "react";
import type { RougeState, UUID } from "@/lib/types";
import type { Toast } from "@/lib/store/RougeContext";
import { blastsFor } from "@/lib/engine/actions";
import { getProfile, ordersOf, pendingSquadInvites, perksOf, squadMessages, squadOf } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { isSafeCtaLink } from "@/lib/security/paths";
import { faceOf, verticalOf } from "@/lib/engine/verticals";
import { awaitsMe, displayStatus, meetingPlace, meetingsOf, otherOf } from "@/lib/engine/meetings";
import { formatTime } from "@/lib/utils";

type Notice = { key: string; toast: Omit<Toast, "id"> };

function noticesFor(s: RougeState, meId: UUID, now: number): Notice[] {
  const eventId = s.active_event_id;
  const first = (id: UUID | null) => faceOf(s, id)?.full_name.split(" ")[0] ?? "Alguien";
  const out: Notice[] = [];

  for (const b of blastsFor(s, eventId, meId, now)) {
    if (b.expires_at && +new Date(b.expires_at) < now) continue;
    out.push({ key: `blast:${b.id}`, toast: { tone: b.is_flash_promo ? "vip" : "info", title: b.title, description: b.message, duration: 9000, cta: b.cta_label && isSafeCtaLink(b.cta_link) ? { label: b.cta_label, href: b.cta_link } : undefined } });
  }

  const sq = squadOf(s, eventId, meId);
  if (sq) {
    for (const m of squadMessages(s, sq.squad.id)) {
      if (m.message_type !== "system_alert" || m.sender_id === meId || !m.content.startsWith("🚨")) continue;
      out.push({ key: `rescue:${m.id}`, toast: { tone: "rouge", title: m.content, description: "Tu amiga/o pidió que vayan a su pin.", duration: 0, cta: { label: "Ir a su pin", href: `/map?focus=${m.sender_id}` } } });
    }
  }

  // Cuentas de la mesa: alguien marcó que me transfirió → confirmar.
  for (const t of s.squad_settlements) {
    if (t.to_user !== meId || t.confirmed_at) continue;
    out.push({ key: `settle:${t.id}`, toast: { tone: "squad", title: `💸 ${first(t.from_user)} dice que te pagó`, description: "Confirmalo en las cuentas de la mesa.", cta: { label: "Ver cuentas", href: "/squad/cuentas" } } });
  }

  for (const o of ordersOf(s, meId, eventId)) {
    if (o.payment_status === "paid" && o.user_id === meId) out.push({ key: `order:${o.id}:paid`, toast: { tone: "vip", title: "✅ Pago acreditado", description: "La barra ya tiene tu pedido." } });
    if (o.status === "ready_qr") out.push({ key: `order:${o.id}:ready`, toast: { tone: "squad", title: "🍸 ¡Tu pedido está listo!", description: `Retiralo en la ventanilla rápida · código ${o.pickup_code}`, duration: 0, cta: { label: "Ver QR", href: "/bar" } } });
    if (o.status === "delivering") out.push({ key: `order:${o.id}:delivering`, toast: { tone: "squad", title: "🛵 Tu pedido va en camino", description: `A ${o.sector_name ?? "tu ubicación"}` } });
  }

  for (const p of perksOf(s, meId, eventId)) {
    if (p.status === "available") out.push({ key: `perk:${p.id}`, toast: { tone: "vip", title: "🎁 ¡Ganaste un QR!", description: p.title, cta: { label: "Ver en Perks", href: "/perks" } } });
  }

  for (const { member, squad } of pendingSquadInvites(s, eventId, meId)) {
    out.push({ key: `invite:${member.id}`, toast: { tone: "squad", title: `👯 ${first(member.invited_by)} te invitó a ${squad.name}`, cta: { label: "Ver invitación", href: "/squad" } } });
  }

  const pro = verticalOf(s, eventId).kind === "corporate";
  for (const c of s.connections) {
    if (c.event_id !== eventId) continue;
    if (c.receiver_id === meId && c.status === "pending") {
      out.push({
        key: `req:${c.id}`,
        toast: c.type === "icebreaker"
          ? { tone: "rouge", title: pro ? `⚡ ${first(c.sender_id)} te mandó su presentación` : `⚡ ${first(c.sender_id)} te mandó su Rompehielos`, description: c.icebreaker_message ?? undefined, cta: { label: "Ver bandeja", href: "/inbox" } }
          : { tone: "rouge", title: `💘 ${first(c.sender_id)} te dio Conectar`, cta: { label: "Ver bandeja", href: "/inbox" } },
      });
    }
    if (c.sender_id === meId && c.status === "accepted" && c.responded_at) {
      out.push({ key: `match:${c.id}`, toast: { tone: "rouge", title: pro ? `🤝 ${first(c.receiver_id)} es tu contacto` : `🔥 ¡Match con ${first(c.receiver_id)}!`, description: "Aceptó tu conexión.", cta: { label: "Escribile", href: `/chat/${c.id}` } } });
    }
  }

  // Reuniones: pedidos y cambios para responder, y confirmaciones (la clave incluye updated_at: cada cambio avisa una vez).
  for (const m of meetingsOf(s, meId, eventId)) {
    const other = first(otherOf(m, meId));
    const when = `${formatTime(m.starts_at)} · ${meetingPlace(s, m)}`;
    if (awaitsMe(m, meId)) {
      out.push({
        key: `meeting:${m.id}:${m.updated_at}`,
        toast: { tone: "squad", title: m.status === "rescheduled" ? `📅 ${other} propuso otro horario` : `📅 ${other} te pidió una reunión`, description: `${when} · ${m.topic}`, cta: { label: "Responder", href: `/meetings#${m.id}` } },
      });
    } else if (m.status === "accepted" && m.proposed_by === meId && displayStatus(m, now) === "accepted") {
      out.push({ key: `meeting:${m.id}:${m.updated_at}`, toast: { tone: "squad", title: `✅ Reunión confirmada con ${other}`, description: when, cta: { label: "Ver", href: `/meetings#${m.id}` } } });
    } else if (m.status === "cancelled" || m.status === "declined") {
      out.push({ key: `meeting:${m.id}:${m.updated_at}`, toast: { tone: "info", title: m.status === "declined" ? `${other} no puede reunirse` : `Se canceló la reunión con ${other}`, description: when } });
    }
  }
  return out;
}

const storageKey = (userId: UUID) => `rouge:seen:${userId}`;

export function LiveNotifications() {
  const { state, notify } = useRouge();
  const meId = state.current_user_id;
  const seen = useRef<{ user: UUID; keys: Set<string> } | null>(null);

  useEffect(() => {
    const now = Date.now();
    const notices = noticesFor(state, meId, now);

    // Primera vez para esta persona: todo lo existente cuenta como visto (sin avalancha).
    if (!seen.current || seen.current.user !== meId) {
      let keys: Set<string> | null = null;
      try {
        const raw = localStorage.getItem(storageKey(meId));
        if (raw) keys = new Set(JSON.parse(raw) as string[]);
      } catch {
        /* sin storage: seguimos en memoria */
      }
      seen.current = { user: meId, keys: keys ?? new Set(notices.map((n) => n.key)) };
      if (!keys) persist(meId, seen.current.keys);
      if (!keys) return;
    }

    const fresh = notices.filter((n) => !seen.current!.keys.has(n.key));
    if (!fresh.length) return;
    fresh.slice(-3).forEach((n) => notify(n.toast));
    fresh.forEach((n) => seen.current!.keys.add(n.key));
    persist(meId, seen.current.keys);
  }, [state, meId, notify]);

  return null;
}

function persist(userId: UUID, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...keys].slice(-400)));
  } catch {
    /* ignore */
  }
}
