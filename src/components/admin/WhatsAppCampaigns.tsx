"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { Check, MessageCircle, Send } from "lucide-react";
import type { CampaignSegment, RougeEvent } from "@/lib/types";
import { campaignOutbox, contactsOf, DEFAULT_TEMPLATE, segmentAudience, SEGMENTS, TEMPLATE_VARS } from "@/lib/engine/campaigns";
import { promoterLinkOf } from "@/lib/engine/promoters";
import { getProfile } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { maskPhone } from "@/lib/engine/profile";
import { Panel } from "@/components/admin/AdminChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/**
 * Generador de campañas por WhatsApp SIN la API paga: segmento + plantilla con variables → bandeja de envío con un
 * botón "Enviar por WhatsApp" por persona (abre WhatsApp Web o la app con el mensaje ya escrito) y estado Contactado.
 */
export function WhatsAppCampaigns({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const now = useNow(60_000);
  const [segment, setSegment] = useState<CampaignSegment>("birthdays_week");
  const [promoter, setPromoter] = useState<string>("");
  const [name, setName] = useState("Cumpleañeros de la semana");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [benefit, setBenefit] = useState("un trago de regalo");
  const [activeId, setActiveId] = useState<string | null>(null);
  const contacts = useMemo(() => contactsOf(state, event.id), [state, event.id]);
  const reach = segmentAudience(contacts, segment, now, promoter || null).length;
  const campaigns = (state.campaigns ?? []).filter((c) => c.event_id === event.id).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const active = campaigns.find((c) => c.id === activeId) ?? campaigns[0] ?? null;
  const promoters = state.event_staff.filter((r) => r.event_id === event.id && r.role === "promoter");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // {link_qr}: el link del RRPP que lo invitó (si hay) o el link del evento; abre el ingreso con su QR.
  const linkFor = (c: { referred_by: string | null }) => {
    const rp = c.referred_by ? promoterLinkOf(state, event.id, c.referred_by) : undefined;
    return `${origin}/join/${rp?.code ?? event.slug}`;
  };
  const outbox = active ? campaignOutbox(state, active, event.name, linkFor, now) : [];
  const done = outbox.filter((r) => r.contacted_at).length;

  const insertVar = (v: string) => setTemplate((t) => (t.length + v.length <= 600 ? `${t}${t.endsWith(" ") || !t ? "" : " "}${v}` : t));
  const create = async () => {
    const r = await exec(C.createCampaign(event.id, { name, segment, template, benefit, promoter_id: promoter || null }));
    if (r.ok) {
      setActiveId(r.data.id);
      notify({ tone: "squad", title: "Campaña lista", description: `${reach} mensajes para enviar desde tu WhatsApp.` });
    }
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><MessageCircle className="size-5 text-squad" /> Campañas por WhatsApp</span>} action={<Badge tone="squad">Sin API paga</Badge>}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-muted">Segmento</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SEGMENTS.map((sg) => {
                const n = segmentAudience(contacts, sg.id, now, sg.id === "rrpp_guests" ? promoter || null : null).length;
                return (
                  <button
                    key={sg.id}
                    type="button"
                    aria-pressed={segment === sg.id}
                    onClick={() => {
                      setSegment(sg.id);
                      setName(sg.label);
                    }}
                    className={cn("rounded-2xl border p-3 text-left text-sm transition", segment === sg.id ? "border-squad bg-squad/10" : "border-white/10 bg-white/[0.03] hover:border-white/25")}
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      <span>{sg.emoji} {sg.label}</span>
                      <span className="metric text-squad">{n}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{sg.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {segment === "rrpp_guests" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">RRPP</span>
              <select value={promoter} onChange={(e) => setPromoter(e.target.value)} className="min-h-touch w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm">
                <option value="" className="bg-surface">Todos los RRPP</option>
                {promoters.map((p) => (
                  <option key={p.user_id} value={p.user_id} className="bg-surface">
                    {getProfile(state, p.user_id)?.full_name ?? "RRPP"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <TextField label="Nombre de la campaña" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <TextField label="{beneficio}" value={benefit} maxLength={80} onChange={(e) => setBenefit(e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Mensaje</span>
            <textarea value={template} onChange={(e) => setTemplate(e.target.value.slice(0, 600))} rows={4} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARS.map((v) => (
              <button key={v} type="button" onClick={() => insertVar(v)} className="min-h-[36px] rounded-full bg-white/[0.06] px-3 font-mono text-xs text-primary hover:bg-white/10">
                {v}
              </button>
            ))}
          </div>
          <Button variant="squad" block onClick={create} disabled={!reach}>
            <Send /> Armar bandeja · {reach} personas
          </Button>
        </div>

        <div className="min-w-0">
          {campaigns.length > 1 && (
            <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
              {campaigns.map((c) => (
                <button key={c.id} type="button" onClick={() => setActiveId(c.id)} className={cn("min-h-[36px] shrink-0 rounded-full px-3 text-xs font-semibold", active?.id === c.id ? "bg-squad text-background" : "bg-white/[0.06] text-muted")}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {active ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-display font-semibold">{active.name}</p>
                <Badge tone={done === outbox.length && outbox.length ? "squad" : "neutral"}>{done}/{outbox.length} contactados</Badge>
              </div>
              <ul className="max-h-[520px] space-y-2 overflow-auto pr-1" aria-label="Bandeja de envío">
                {outbox.map((r) => (
                  <li key={r.contact.user_id} className={cn("rounded-2xl border p-3", r.contacted_at ? "border-squad/30 bg-squad/[0.04]" : "border-white/10 bg-white/[0.03]")}>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold">{r.contact.full_name} <span className="text-xs font-normal text-muted">{r.contact.phone ? maskPhone(r.contact.phone) : ""}</span></p>
                      {r.contacted_at && <Badge tone="squad"><Check className="mr-0.5 inline size-3" /> Contactado</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{r.message}</p>
                    <div className="mt-2 flex gap-2">
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void exec(C.markContacted(active.id, r.contact.user_id, true), { silent: true })}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-black"
                      >
                        <MessageCircle className="size-4" /> Enviar por WhatsApp
                      </a>
                      {r.contacted_at && (
                        <Button size="sm" variant="ghost" onClick={() => exec(C.markContacted(active.id, r.contact.user_id, false))}>
                          Desmarcar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {!outbox.length && <li className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-muted">Nadie del segmento tiene teléfono cargado.</li>}
              </ul>
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">Elegí un segmento y armá la bandeja: cada mensaje sale desde tu WhatsApp (Web o celular) con un toque.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
