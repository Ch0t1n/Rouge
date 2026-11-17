"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useRef, useState } from "react";
import { Ban, Copy, Download, ImagePlus, Link2, Plus, Printer, QrCode, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import type { LineupSlot, RougeEvent } from "@/lib/types";
import { generateInviteCodes, upsertEvent } from "@/lib/engine/actions";
import { lobbyPhase } from "@/lib/engine/selectors";
import { myBrands } from "@/lib/engine/branding";
import { compressImage } from "@/lib/media/compress";
import { uploadMedia } from "@/lib/media/upload";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatDateTime, toCSV, uid } from "@/lib/utils";
import { AdminHeader, downloadCSV, Panel } from "@/components/admin/AdminChrome";
import { useShare } from "@/components/share/ShareSheet";
import { TeamPanel } from "@/components/admin/TeamPanel";
import { OrgStaffPanel, TerminalPinPanel } from "@/components/admin/OrgStaffPanel";
import { AuditPanel } from "@/components/admin/AuditPanel";
import { TicketListsPanel } from "@/components/admin/TicketListsPanel";
import { EventBuilderWizard } from "@/components/admin/EventBuilderWizard";
import { EventModulesPanel } from "@/components/admin/EventModulesPanel";
import { canManageModules } from "@/lib/engine/eventAdmin";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";
import { EventLifecyclePanel } from "@/components/admin/EventLifecyclePanel";
import { can } from "@/lib/engine/roles";
import { VenueMap } from "@/components/venue/VenueMap";
import { VENUE_LAYOUT } from "@/lib/mock/seed";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";

const H = 3_600_000;
/** ISO → valor de <input type="datetime-local"> en hora local */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => new Date(v).toISOString();

export default function AdminEventsPage() {
  const { state, setActiveEvent } = useRouge();
  // Solo los eventos que mi rol puede editar; sin ninguno, el formulario arranca en "Nuevo evento".
  const mine = state.events.filter((e) => can(state, e.id, state.current_user_id, "admin.events"));
  const [editing, setEditing] = useState<string | "new">(mine.some((e) => e.id === state.active_event_id) ? state.active_event_id : "new");
  const event = editing === "new" ? null : mine.find((e) => e.id === editing) ?? null;
  // v1.8: crear eventos y configurar módulos es de ROUGE HQ; el dueño/a usa el MISMO creador si tiene autogestión.
  const selfService = canManageModules(state, state.current_user_id, state.current_user_id);
  const [builder, setBuilder] = useState(false);

  return (
    <main className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="Eventos y accesos"
        subtitle="Configurá la fiesta, el lobby, el plano y los links de ingreso."
        actions={
          selfService ? (
            <Button variant="vip" onClick={() => setBuilder(true)}>
              <Plus /> Nuevo evento
            </Button>
          ) : undefined
        }
      />
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {mine.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              setEditing(e.id);
              setActiveEvent(e.id);
            }}
            className={cn("shrink-0 rounded-2xl border px-4 py-2.5 text-left transition", editing === e.id ? "border-vip bg-vip/10" : "border-white/10 bg-white/[0.03] hover:bg-white/5")}
          >
            <p className="text-sm font-semibold">{e.name}</p>
            <p className="text-xs text-muted">{formatDateTime(e.starts_at)} · {lobbyPhase(e) === "live" ? "en vivo" : lobbyPhase(e)}</p>
          </button>
        ))}
      </div>
      {builder ? (
        <Panel title="Nuevo evento">
          <EventBuilderWizard
            defaultOrgId={state.current_user_id}
            onCancel={() => setBuilder(false)}
            onDone={(id) => {
              setBuilder(false);
              setEditing(id);
              setActiveEvent(id);
            }}
          />
        </Panel>
      ) : event ? (
        <EventEditor key={editing} event={event} onSaved={(id) => { setEditing(id); setActiveEvent(id); }} />
      ) : (
        <Panel title="Nuevo evento">
          <p className="text-sm text-muted">
            {selfService ? "Creá tu evento con el creador: datos, fechas, listas, line-up, estética y módulos." : "La creación de eventos la gestiona ROUGE. Pedí que activen la autogestión de tu organización para crearlos vos."}
          </p>
          {selfService && (
            <Button variant="vip" className="mt-4" onClick={() => setBuilder(true)}>
              <Plus /> Abrir el creador
            </Button>
          )}
        </Panel>
      )}
      {event && !builder && <EventModulesPanel event={event} editable={canManageModules(state, state.current_user_id, event.created_by)} />}
      {event && <AccessPanel event={event} />}
      {event && can(state, event.id, state.current_user_id, "admin.events") && <TicketListsPanel event={event} />}
      {event && (
        <div className="grid gap-6 xl:grid-cols-3">
          <ApiKeysPanel event={event} />
        </div>
      )}
      {event && can(state, event.id, state.current_user_id, "admin.team") && <TeamPanel event={event} />}
      {/* Staff por organización: solo quien es dueño/a de SUS eventos (organización = su cuenta). */}
      {event && event.created_by === state.current_user_id && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <OrgStaffPanel />
          <TerminalPinPanel orgId={state.current_user_id} />
        </div>
      )}
      {event && event.created_by && can(state, event.id, state.current_user_id, "admin.events") && <AuditPanel orgId={event.created_by} />}
      {event && (
        <EventLifecyclePanel
          key={`lifecycle-${event.id}`} // distinto del key del EventEditor (mismos hermanos)
          event={event}
          onDuplicated={(id) => {
            setEditing(id);
            setActiveEvent(id);
          }}
          onDeleted={() => setEditing("new")}
        />
      )}
    </main>
  );
}

function EventEditor({ event, onSaved }: { event: RougeEvent | null; onSaved: (id: string) => void }) {
  const { state, exec, notify } = useRouge();
  const defaults = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7)); // próximo sábado
    start.setHours(23, 30, 0, 0);
    return { starts: start.toISOString(), ends: new Date(start.getTime() + 6 * H).toISOString() };
  }, []);
  const [name, setName] = useState(event?.name ?? "");
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [venue, setVenue] = useState(event?.venue_name ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [starts, setStarts] = useState(toLocal(event?.starts_at ?? defaults.starts));
  const [ends, setEnds] = useState(toLocal(event?.ends_at ?? defaults.ends));
  const [opensBefore, setOpensBefore] = useState(event ? Math.round((+new Date(event.starts_at) - +new Date(event.lobby_opens_at)) / H) : 48);
  const [closesAfter, setClosesAfter] = useState(event ? Math.round((+new Date(event.lobby_expires_at) - +new Date(event.ends_at)) / H) : 24);
  const [capacity, setCapacity] = useState(event?.max_capacity ?? 1500);
  const [mapUrl, setMapUrl] = useState<string | null>(event?.venue_map_url ?? null);
  const [lineup, setLineup] = useState<LineupSlot[]>(event?.lineup_json ?? []);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const layout = event?.venue_layout_json ?? state.events[0]?.venue_layout_json ?? VENUE_LAYOUT;

  const save = async () => {
    const s = fromLocal(starts);
    const e = fromLocal(ends);
    const r = await exec(
      C.upsertEvent({
        // Un evento nuevo arranca con mi marca (logo, colores y cobro); se cambia en Marca y cobros.
        ...(event ? { id: event.id } : { brand_id: myBrands(state)[0]?.id ?? null }),
        name,
        slug: slug || undefined,
        venue_name: venue,
        description,
        starts_at: s,
        ends_at: e,
        lobby_opens_at: new Date(+new Date(s) - opensBefore * H).toISOString(),
        lobby_expires_at: new Date(+new Date(e) + closesAfter * H).toISOString(),
        max_capacity: Number(capacity),
        venue_map_url: mapUrl,
        lineup_json: [...lineup].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
      }),
    );
    if (r.ok) {
      notify({ tone: "vip", title: event ? "Evento actualizado ✓" : `🎉 Evento creado: ${r.data.name}`, description: `Link maestro: /join/${r.data.slug}` });
      onSaved(r.data.id);
    }
  };

  const onMap = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const compressed = await compressImage(f, "venueMap");
      setMapUrl(await uploadMedia(compressed, "photo"));
    } catch {
      notify({ tone: "error", title: "No pudimos procesar el plano", description: "Probá con PNG o JPG." });
    } finally {
      setUploading(false);
    }
  };

  const addSlot = () => {
    const last = lineup.at(-1);
    const from = last ? last.ends_at : fromLocal(starts);
    setLineup([...lineup, { id: uid(), artist: "", starts_at: from, ends_at: new Date(+new Date(from) + 1.5 * H).toISOString() }]);
  };
  const patchSlot = (id: string, patch: Partial<LineupSlot>) => setLineup(lineup.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)));

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title={event ? "Datos del evento" : "Nuevo evento"} className="xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="ROUGE Night × Bresh" />
          <TextField label="Link del evento" prefix="/join/" className="pl-[4.2rem]" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="se genera del nombre" />
          <TextField label="Lugar" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Club · Barrio" />
          <TextField label="Cupo máximo en la app" type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          <TextField label="Empieza" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <TextField label="Termina" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <TextField label="El lobby abre (horas antes)" type="number" min={0} value={opensBefore} onChange={(e) => setOpensBefore(Number(e.target.value))} hint="Para armar Squads y conectar antes de la fiesta." />
          <TextField label="El lobby cierra (horas después)" type="number" min={0} value={closesAfter} onChange={(e) => setClosesAfter(Number(e.target.value))} hint="Efecto Cenicienta: los matches y chats quedan." />
        </div>
        <div className="mt-4">
          <TextAreaField label="Descripción" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base">Line-up</h3>
            <Button size="sm" variant="glass" onClick={addSlot}>
              <Plus /> Agregar set
            </Button>
          </div>
          {lineup.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">Sin sets todavía.</p>}
          <ul className="space-y-2">
            {lineup.map((sl) => (
              <li key={sl.id} className="grid grid-cols-1 items-end gap-2 rounded-2xl border border-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] 2xl:grid-cols-[minmax(10rem,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                <div className="min-w-0 sm:col-span-4 2xl:col-span-1">
                  <TextField label="Artista" value={sl.artist} onChange={(e) => patchSlot(sl.id, { artist: e.target.value })} />
                </div>
                <TextField label="Desde" type="datetime-local" value={toLocal(sl.starts_at)} onChange={(e) => patchSlot(sl.id, { starts_at: fromLocal(e.target.value) })} />
                <TextField label="Hasta" type="datetime-local" value={toLocal(sl.ends_at)} onChange={(e) => patchSlot(sl.id, { ends_at: fromLocal(e.target.value) })} />
                <label className="flex min-h-[52px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!sl.is_headliner} onChange={(e) => patchSlot(sl.id, { is_headliner: e.target.checked })} className="size-5 accent-rouge" /> Headliner
                </label>
                <Button size="icon" variant="ghost" aria-label={`Quitar ${sl.artist || "set"}`} onClick={() => setLineup(lineup.filter((x) => x.id !== sl.id))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <Button size="lg" variant="vip" className="mt-6" onClick={save} disabled={!name.trim()}>
          <Save /> {event ? "Guardar cambios" : "Crear evento"}
        </Button>
      </Panel>

      <Panel title="Plano del lugar">
        {layout && <VenueMap layout={layout} mapImageUrl={mapUrl} compact />}
        <p className="mt-3 text-xs text-muted">
          {mapUrl ? "Usando el plano subido como fondo. Los sectores siguen activos para pines y segmentación." : "Usando el plano vectorial por sectores. Podés subir el plano ilustrado del lugar."}
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="glass" disabled={uploading} onClick={() => file.current?.click()}>
            <ImagePlus /> {uploading ? "Comprimiendo…" : "Subir plano"}
          </Button>
          {mapUrl && (
            <Button size="sm" variant="ghost" onClick={() => setMapUrl(null)}>
              Usar vectorial
            </Button>
          )}
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onMap(e.target.files?.[0])} />
      </Panel>
    </div>
  );
}

function AccessPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const [count, setCount] = useState(50);
  const share = useShare();
  const [filter, setFilter] = useState<"all" | "free" | "used" | "revoked">("all");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const masterLink = `${origin}/join/${event.slug}`;
  const codes = state.event_invite_codes.filter((c) => c.event_id === event.id).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const isFree = (c: (typeof codes)[number]) => !c.is_used && !c.revoked_at;
  const shown = codes.filter((c) => (filter === "all" ? true : filter === "free" ? isFree(c) : filter === "used" ? c.is_used : !!c.revoked_at));
  const attendees = state.event_attendees.filter((a) => a.event_id === event.id).length;

  const copy = async (text: string, label = "Copiado") => {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    notify({ tone: "squad", title: `${label} 🔗`, duration: 1600 });
  };

  const exportCodes = () =>
    downloadCSV(
      `codigos-${event.slug}.csv`,
      toCSV(
        codes.map((c) => ({
          codigo: c.code,
          link: `${origin}/join/${c.code}`,
          qr: `${origin}/api/v1/qr/${c.code}`,
          entrada: c.external_ref ?? "",
          etiqueta: c.label ?? "",
          origen: c.source === "api" ? "API" : "panel",
          estado: c.is_used ? "usado" : c.revoked_at ? "anulado" : "disponible",
          usado_por: c.used_by_user_id ? `@${state.profiles.find((p) => p.id === c.used_by_user_id)?.username ?? ""}` : "",
          usado_el: c.used_at ?? "",
        })),
      ),
    );

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title="Link Maestro">
        <p className="text-sm text-muted">Para redes y listas. Respeta el cupo: {attendees}/{event.max_capacity} usados.</p>
        <div className="mt-3 flex gap-2">
          <code className="flex min-h-touch flex-1 items-center truncate rounded-xl bg-white/[0.05] px-3 font-display text-sm">{masterLink}</code>
          <Button size="icon" variant="glass" aria-label="Copiar link maestro" onClick={() => copy(masterLink, "Link maestro copiado")}>
            <Copy />
          </Button>
          <Button
            size="icon"
            variant="glass"
            aria-label="Ver QR del link maestro"
            onClick={() => share.open({ url: masterLink, title: `QR de ${event.name}`, text: `Entrá al lobby de ${event.name} en ROUGE 🔴`, fileName: `rouge-${event.slug}`, accent: "vip", caption: event.master_invite_code })}
          >
            <QrCode />
          </Button>
        </div>
        <p className="mt-3 text-sm">
          Código maestro: <code className="font-display font-bold text-vip">{event.master_invite_code}</code>
        </p>
      </Panel>

      <Panel
        title="Códigos únicos de 1 uso"
        className="xl:col-span-2"
        action={
          <div className="flex gap-2">
            <Link href={`/admin/print-codes?event=${event.id}`} className={cn(buttonVariants({ size: "sm", variant: "glass" }), !codes.some(isFree) && "pointer-events-none opacity-40")}>
              <Printer /> Imprimir QRs
            </Link>
            <Button size="sm" variant="glass" onClick={exportCodes} disabled={!codes.length}>
              <Download /> CSV
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <TextField label="Cantidad" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <Button
            variant="vip"
            onClick={async () => {
              const r = await exec(C.generateInviteCodes(event.id, count));
              if (r.ok) notify({ tone: "vip", title: `🎟️ ${r.data.length} códigos generados`, description: "Entregalos con cada entrada (email, ticketera o impresos)." });
            }}
          >
            <Link2 /> Generar lote
          </Button>
          <div className="ml-auto flex gap-1">
            {(["all", "free", "used", "revoked"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={cn("min-h-[40px] rounded-full px-3 text-xs font-semibold", filter === f ? "bg-vip text-background" : "bg-white/[0.05] text-muted")}>
                {f === "all" ? `Todos · ${codes.length}` : f === "free" ? `Libres · ${codes.filter(isFree).length}` : f === "used" ? `Usados · ${codes.filter((c) => c.is_used).length}` : `Anulados · ${codes.filter((c) => c.revoked_at).length}`}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 max-h-80 overflow-auto rounded-2xl border border-white/5">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Código</th>
                <th className="px-4 py-2 font-semibold">Entrada</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
                <th className="px-4 py-2 font-semibold">Usado por</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 300).map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="px-4 py-2 font-display font-semibold tracking-wider">{c.code}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {c.external_ref ?? "—"}
                    {c.label && <span className="ml-1 text-primary/80">· {c.label}</span>}
                    {c.source === "api" && <Badge tone="vip" className="ml-1.5">API</Badge>}
                  </td>
                  <td className="px-4 py-2">{c.is_used ? <Badge>Usado</Badge> : c.revoked_at ? <Badge tone="rouge">Anulado</Badge> : <Badge tone="squad">Libre</Badge>}</td>
                  <td className="px-4 py-2 text-muted">{c.used_by_user_id ? `@${state.profiles.find((p) => p.id === c.used_by_user_id)?.username ?? "—"}` : "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    {isFree(c) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Anular ${c.code}`}
                        onClick={async () => {
                          const r = await exec(C.revokeInviteCode(c));
                          if (r.ok) notify({ tone: "info", title: `Código ${c.code} anulado`, description: "Ya no sirve para entrar (ej. entrada reembolsada)." });
                        }}
                      >
                        <Ban />
                      </Button>
                    )}
                    {isFree(c) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`QR de ${c.code}`}
                        onClick={() => share.open({ url: `${origin}/join/${c.code}`, title: `Entrada ${c.code}`, text: `Tu acceso a ${event.name} en ROUGE (1 uso, no lo compartas) 🎟️`, fileName: `rouge-${c.code}`, accent: "vip", caption: c.code })}
                      >
                        <QrCode />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" aria-label={`Copiar link de ${c.code}`} onClick={() => copy(`${origin}/join/${c.code}`, "Link de 1 uso copiado")}>
                      <Copy />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {share.sheet}
    </div>
  );
}
