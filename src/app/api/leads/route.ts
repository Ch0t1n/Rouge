import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { leadNotification, validateLead, type LeadInput } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads — formularios de /pro (demo ejecutiva).
 *  1. Valida (mismas reglas que los checks de b2b_leads) y descarta spam (honeypot + límite por IP).
 *  2. Guarda en `b2b_leads` con service role (RLS sin políticas: ningún cliente lee leads).
 *  3. Avisa al equipo comercial al instante por LEADS_WEBHOOK_URL (Slack, Make, Zapier…) con `{ text }`.
 * Sin base ni webhook configurados responde 503 `not_configured` (el formulario ofrece el mail de ventas).
 */
const MAX_BODY = 8_000;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

const err = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (rateLimited(ip)) return err(429, "rate_limited", "Recibimos varios pedidos seguidos. Probá en unos minutos o escribinos por mail.");

  const raw = await req.text();
  if (raw.length > MAX_BODY) return err(413, "too_large", "El mensaje es demasiado largo.");
  let body: LeadInput;
  try {
    body = JSON.parse(raw) as LeadInput;
  } catch {
    return err(400, "invalid_json", "No pudimos leer el formulario.");
  }

  const v = validateLead(body);
  // Spam: respuesta igual a un éxito (no le enseñamos al bot qué falló) y no se guarda nada.
  if (!v.ok && v.spam) return NextResponse.json({ data: { stored: false, notified: false } }, { status: 201 });
  if (!v.ok) return err(422, "invalid_lead", "Revisá los datos del formulario.", { fields: v.errors });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhook = process.env.LEADS_WEBHOOK_URL;
  if (!(url && serviceKey) && !webhook) return err(503, "not_configured", "El formulario todavía no está conectado.");

  let stored = false;
  let leadId: string | null = null;
  if (url && serviceKey) {
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("b2b_leads").insert(v.lead).select("id").single();
    if (error) return err(500, "store_failed", "No pudimos guardar tu pedido. Probá de nuevo.");
    stored = true;
    leadId = (data as { id: string }).id;
  }

  let notified = false;
  if (webhook) {
    try {
      const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: leadNotification(v.lead), lead: v.lead }), signal: AbortSignal.timeout(5000) });
      notified = res.ok;
    } catch {
      notified = false;
    }
    if (notified && stored && url && serviceKey && leadId) {
      const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await db.from("b2b_leads").update({ notified_at: new Date().toISOString() }).eq("id", leadId);
    }
  }
  // Sin base, el lead solo existe si el webhook lo recibió.
  if (!stored && !notified) return err(502, "notify_failed", "No pudimos enviar tu pedido. Probá de nuevo o escribinos por mail.");
  return NextResponse.json({ data: { stored, notified } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
