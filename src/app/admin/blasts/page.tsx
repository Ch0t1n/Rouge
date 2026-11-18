"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { Megaphone, Send, Zap } from "lucide-react";
import { MOOD_TAGS, type BlastSegment, type MoodTag } from "@/lib/types";
import { blastAudience, sendBlast } from "@/lib/engine/actions";
import { activeEvent } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, timeAgo } from "@/lib/utils";
import { AdminHeader, Panel } from "@/components/admin/AdminChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { WhatsAppCampaigns } from "@/components/admin/WhatsAppCampaigns";

type SegKind = BlastSegment["kind"];

const TEMPLATES = [
  { title: "⚡ FLASH PROMO · 20 min", message: "2x1 en Barra Terraza AHORA. Mostrá la app en la barra.", cta: "Ver en el plano", link: "/map", flash: 20 },
  { title: "🎟️ Sorteo en 10 minutos", message: "Dejá tu pin en el plano para participar por una botella en el VIP.", cta: "Dejar mi pin", link: "/map", flash: 0 },
  { title: "👯 ¡Armá tu Squad!", message: "Squads de 4 antes de la 01:00 reciben un trago de bienvenida para cada una.", cta: "Armar Squad", link: "/squad", flash: 0 },
  { title: "🍾 Barra Express sin filas", message: "Pedí desde la app y retirá por la ventanilla rápida.", cta: "Pedir ahora", link: "/bar", flash: 0 },
];

function segmentLabel(s: BlastSegment) {
  switch (s.kind) {
    case "all": return "Todo el evento";
    case "squad_min_size": return `Squads de ${s.min}+`;
    case "sector": return `En ${s.sector_name}`;
    case "mood": return `Mood: ${MOOD_TAGS.find((m) => m.id === s.mood)?.label}`;
    case "top_spenders": return `Top ${s.limit} spenders`;
  }
}

export default function AdminBlastsPage() {
  const { state, exec, notify } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [cta, setCta] = useState("");
  const [link, setLink] = useState("");
  const [flash, setFlash] = useState(false);
  const [flashMin, setFlashMin] = useState(20);
  const [kind, setKind] = useState<SegKind>("all");
  const [min, setMin] = useState(4);
  const [sector, setSector] = useState(event.venue_layout_json.sectors.find((s) => s.kind === "dancefloor")?.name ?? "");
  const [mood, setMood] = useState<MoodTag>("open_to_meet");
  const [limit, setLimit] = useState(20);

  const segment: BlastSegment =
    kind === "all" ? { kind } : kind === "squad_min_size" ? { kind, min } : kind === "sector" ? { kind, sector_name: sector } : kind === "mood" ? { kind, mood } : { kind, limit };
  const reach = useMemo(() => blastAudience(state, event.id, segment, now).length, [state, event.id, segment, now]);
  const history = state.event_blasts.filter((b) => b.event_id === event.id).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const send = async () => {
    const r = await exec(C.sendBlast(event.id, { title, message, segment, ctaLabel: cta, ctaLink: link, flashMinutes: flash ? flashMin : undefined }));
    if (r.ok) {
      notify({ tone: "vip", title: `📣 Enviado a ${r.data.reach} asistentes`, description: "Les aparece como banner arriba de la pantalla." });
      setTitle("");
      setMessage("");
    }
  };

  return (
    <main className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader title="Text Blast y Flash Promos" subtitle="Avisos instantáneos a todo el evento o a un segmento. Ideal para descomprimir barras llenas." />

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Nuevo aviso" className="xl:col-span-2">
          <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.title}
                type="button"
                onClick={() => {
                  setTitle(t.title);
                  setMessage(t.message);
                  setCta(t.cta);
                  setLink(t.link);
                  setFlash(t.flash > 0);
                  if (t.flash) setFlashMin(t.flash);
                }}
                className="glass-pill shrink-0 whitespace-nowrap py-2"
              >
                {t.title}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            <TextField label="Título" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="⚡ 2x1 en Barra Terraza" />
            <TextAreaField label="Mensaje" value={message} maxLength={180} onChange={(e) => setMessage(e.target.value)} placeholder="Mostrá la app en la barra durante los próximos 20 minutos." />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Botón (opcional)" value={cta} maxLength={24} onChange={(e) => setCta(e.target.value)} placeholder="Ver en el plano" />
              <label className="space-y-1.5">
                <span className="font-display text-[13px] font-semibold">Lleva a</span>
                <select value={link} onChange={(e) => setLink(e.target.value)} className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm">
                  <option value="" className="bg-surface">Sin destino</option>
                  <option value="/map" className="bg-surface">Plano</option>
                  <option value="/bar" className="bg-surface">Barra Express</option>
                  <option value="/squad" className="bg-surface">Squad</option>
                  <option value="/perks" className="bg-surface">Mis Perks</option>
                  <option value="/lobby" className="bg-surface">Lobby</option>
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-vip/30 bg-vip/[0.05] px-4 py-1">
              <Switch tone="vip" id="flash" checked={flash} onCheckedChange={setFlash} label="⚡ Flash Promo con vencimiento" description="Muestra cuenta regresiva y se desactiva sola." />
              {flash && (
                <div className="flex gap-2 pb-3">
                  {[10, 20, 30].map((n) => (
                    <button key={n} type="button" onClick={() => setFlashMin(n)} className={cn("min-h-[40px] rounded-full px-4 text-sm font-semibold", flashMin === n ? "bg-vip text-background" : "bg-white/[0.06]")}>
                      {n} min
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 font-display text-[13px] font-semibold">Segmento</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "Todo el evento"],
                    ["squad_min_size", "Squads de N+"],
                    ["sector", "Por sector (pin activo)"],
                    ["mood", "Por mood"],
                    ["top_spenders", "Top spenders"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("min-h-[40px] rounded-full border px-3 text-sm font-semibold", kind === k ? "border-vip bg-vip/15 text-vip" : "border-white/10 bg-white/[0.03] text-muted")}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 max-w-xs">
                {kind === "squad_min_size" && <TextField label="Mínimo de integrantes" type="number" min={2} value={min} onChange={(e) => setMin(Number(e.target.value))} />}
                {kind === "top_spenders" && <TextField label="Cantidad" type="number" min={1} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />}
                {kind === "sector" && (
                  <select value={sector} onChange={(e) => setSector(e.target.value)} className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm" aria-label="Sector">
                    {event.venue_layout_json.sectors.map((s) => (
                      <option key={s.id} value={s.name} className="bg-surface">{s.name}</option>
                    ))}
                  </select>
                )}
                {kind === "mood" && (
                  <select value={mood} onChange={(e) => setMood(e.target.value as MoodTag)} className="min-h-[52px] w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm" aria-label="Mood">
                    {MOOD_TAGS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-surface">{m.emoji} {m.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
              <p className="text-sm">
                Alcance: <span className="metric text-2xl text-vip">{reach}</span> <span className="text-muted">asistentes</span>
              </p>
              <Button size="lg" variant="vip" className="ml-auto" onClick={send} disabled={!title.trim() || !message.trim() || reach === 0}>
                <Send /> Enviar ahora
              </Button>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Vista previa">
            <div className="rounded-[28px] border border-white/10 bg-background p-3">
              <div className={cn("glass relative overflow-hidden rounded-2xl py-3 pl-4 pr-3", flash ? "border-vip/60 shadow-glow-vip" : "border-white/15")}>
                <span className={cn("absolute inset-y-0 left-0 w-1", flash ? "bg-vip" : "bg-muted")} />
                <p className="font-display text-sm font-semibold">{title || "Título del aviso"}</p>
                <p className="mt-0.5 text-[13px] text-muted">{message || "El mensaje aparece acá."}</p>
                {cta && <span className="mt-2 inline-flex min-h-[32px] items-center rounded-full bg-white/10 px-3 text-xs font-semibold">{cta}</span>}
              </div>
              <div className="mt-3 h-40 rounded-2xl bg-white/[0.03]" aria-hidden />
            </div>
          </Panel>

          <Panel title="Enviados">
            {history.length === 0 && <p className="text-sm text-muted">Todavía no enviaste avisos.</p>}
            <ul className="space-y-3">
              {history.map((b) => {
                const live = b.expires_at ? Math.ceil((+new Date(b.expires_at) - now) / 60_000) : null;
                return (
                  <li key={b.id} className="rounded-2xl border border-white/10 p-3">
                    <div className="flex items-start gap-2">
                      {b.is_flash_promo ? <Zap className="mt-0.5 size-4 shrink-0 text-vip" /> : <Megaphone className="mt-0.5 size-4 shrink-0 text-muted" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{b.title}</p>
                        <p className="text-xs text-muted">
                          {segmentLabel(b.target_segment)} · {blastAudience(state, event.id, b.target_segment, now).length} personas · {timeAgo(b.created_at)}
                        </p>
                      </div>
                      {live !== null && <Badge tone={live > 0 ? "vip" : "neutral"}>{live > 0 ? `${live}′` : "Vencida"}</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
      <div id="whatsapp">
        <WhatsAppCampaigns event={event} />
      </div>
    </main>
  );
}
