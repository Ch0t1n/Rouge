"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Palette, Plus, Save, Trash2 } from "lucide-react";
import type { EventLifecycle, LineupSlot, RougeEvent, UUID } from "@/lib/types";
import { checkBrandColor } from "@/lib/engine/branding";
import { builderInputOf, canManageModules, LIFECYCLES, type EventBuilderInput } from "@/lib/engine/eventAdmin";
import { ALL_FEATURES, FEATURES, resolveFeatures } from "@/lib/engine/features";
import { isPlatformAdmin } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatMoney, uid } from "@/lib/utils";
import { FeatureModulesPanel } from "@/components/admin/FeatureModulesPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";

/** ISO ⇄ <input type="datetime-local"> en hora local. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

const STEPS = ["Datos", "Fechas, aforo y listas", "Line-up y estética", "Módulos", "Revisión"] as const;
const select = "min-h-touch w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-vip/50";

function blank(orgId: UUID): EventBuilderInput {
  const start = new Date();
  start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7));
  start.setHours(23, 30, 0, 0);
  return {
    organization_id: orgId,
    name: "",
    description: "",
    slug: "",
    venue_name: "",
    starts_at: start.toISOString(),
    ends_at: new Date(+start + 6 * 3_600_000).toISOString(),
    lifecycle_status: "draft",
    max_capacity: 1000,
    lineup_json: [],
    brand_id: null,
    logo_url: null,
    theme_primary: null,
    theme_accent: null,
    features: ALL_FEATURES,
    lists: [],
  };
}

/**
 * Creador modular de eventos (crear o editar). Hoy lo usa ROUGE HQ en /superadmin; el mismo componente sirve al
 * dueño/a en /admin/events cuando su organización tiene `allow_owner_self_service` (las reglas viven en el motor:
 * saveEventFromBuilder / canManageModules, y en SQL: builder_save_event / can_manage_modules).
 */
export function EventBuilderWizard({ event, defaultOrgId, onDone, onCancel }: { event?: RougeEvent | null; defaultOrgId?: UUID; onDone?: (eventId: UUID) => void; onCancel?: () => void }) {
  const { state, exec, notify } = useRouge();
  const me = state.current_user_id;
  const hq = isPlatformAdmin(state, me);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EventBuilderInput>(() => (event ? builderInputOf(state, event) : blank(defaultOrgId ?? me)));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EventBuilderInput>(k: K, v: EventBuilderInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Organizaciones posibles: dueños/as de eventos o con configuración (ROUGE HQ elige; el dueño/a, la suya).
  const orgs = useMemo(() => {
    const ids = new Set<UUID>([...state.events.map((e) => e.created_by).filter((x): x is UUID => !!x), ...(state.organization_settings ?? []).map((o) => o.organization_id)]);
    if (form.organization_id) ids.add(form.organization_id);
    return [...ids].map((id) => ({ id, name: getProfile(state, id)?.full_name ?? id.slice(0, 8) }));
  }, [state, form.organization_id]);
  const [orgHandle, setOrgHandle] = useState("");
  const brands = state.brands.filter((b) => b.owner_id === form.organization_id);
  const primaryErr = form.theme_primary ? checkBrandColor(form.theme_primary, "primary") : null;
  const accentErr = form.theme_accent ? checkBrandColor(form.theme_accent, "accent") : null;
  const flags = resolveFeatures(form.features);
  const allowed = canManageModules(state, me, event?.created_by ?? form.organization_id);

  const stepError = [
    !form.name.trim() ? "Poné un nombre." : !form.organization_id ? "Elegí la organización." : null,
    !form.starts_at || !form.ends_at ? "Completá las fechas." : +new Date(form.ends_at) <= +new Date(form.starts_at) ? "La fiesta debe terminar después de empezar." : form.max_capacity < 1 ? "El aforo tiene que ser mayor a 0." : null,
    primaryErr ?? accentErr ?? ((form.lineup_json ?? []).some((s) => !s.artist.trim()) ? "Cada set necesita artista." : null),
    null,
    null,
  ][step];

  const save = async () => {
    setBusy(true);
    const r = await exec(C.saveEventFromBuilder({ ...form, features: flags }));
    setBusy(false);
    if (!r.ok) return;
    notify({ tone: "vip", title: event ? "Evento actualizado" : "Evento creado", description: `${r.data.event.name} · /join/${r.data.event.slug}` });
    onDone?.(r.data.event.id);
  };

  if (!allowed) {
    return <p className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-muted">La creación de eventos y sus módulos la gestiona ROUGE. Pedí que activen la autogestión de tu organización.</p>;
  }

  const lineup = form.lineup_json ?? [];
  const lists = form.lists ?? [];

  return (
    <div className="space-y-6">
      {/* Pasos */}
      <ol className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => (i < step || !stepError ? setStep(i) : undefined)} aria-current={i === step ? "step" : undefined} className={cn("inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold", i === step ? "bg-vip text-background" : i < step ? "bg-vip/15 text-vip" : "bg-white/[0.05] text-muted")}>
              <span className="grid size-5 place-items-center rounded-full bg-black/20 font-display">{i < step ? <Check className="size-3" /> : i + 1}</span> {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label="Nombre del evento" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="Techno Bunker · Sábado" />
          <TextField label="Link / código de acceso" prefix="/join/" value={form.slug ?? ""} maxLength={40} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="se arma con el nombre" hint="Es el link maestro del evento (además de los códigos de 1 uso)." />
          <TextField label="Lugar" value={form.venue_name ?? ""} maxLength={80} onChange={(e) => set("venue_name", e.target.value)} placeholder="Club Crobar · Palermo" />
          <div>
            <span className="mb-1.5 block font-display text-[13px] font-semibold">Organización / dueño/a</span>
            {hq ? (
              <div className="space-y-2">
                <select aria-label="Organización" value={form.organization_id} onChange={(e) => set("organization_id", e.target.value)} className={select}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id} className="bg-surface">{o.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input value={orgHandle} onChange={(e) => setOrgHandle(e.target.value)} placeholder="o asignar por @usuario" aria-label="Asignar por @usuario" className="min-h-touch flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm" />
                  <Button
                    variant="glass"
                    onClick={() => {
                      const p = state.profiles.find((x) => x.username === orgHandle.trim().replace(/^@/, "").toLowerCase());
                      if (p) {
                        set("organization_id", p.id);
                        setOrgHandle("");
                      } else notify({ tone: "rouge", title: "No encontramos ese @usuario" });
                    }}
                  >
                    Asignar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="min-h-touch content-center rounded-xl border border-white/10 px-3 text-sm">{getProfile(state, form.organization_id)?.full_name ?? "Tu organización"}</p>
            )}
          </div>
          <div className="lg:col-span-2">
            <TextAreaField label="Descripción" value={form.description ?? ""} maxLength={400} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <TextField label="Apertura (inicio)" type="datetime-local" value={toLocal(form.starts_at)} onChange={(e) => set("starts_at", fromLocal(e.target.value))} />
            <TextField label="Cierre (fin)" type="datetime-local" value={toLocal(form.ends_at)} onChange={(e) => set("ends_at", fromLocal(e.target.value))} />
            <TextField label="Aforo total" inputMode="numeric" value={String(form.max_capacity)} onChange={(e) => set("max_capacity", Number(e.target.value.replace(/\D/g, "")) || 0)} />
          </div>
          <fieldset>
            <legend className="mb-2 font-display text-[13px] font-semibold">Estado del evento</legend>
            <div className="grid gap-2 sm:grid-cols-4">
              {LIFECYCLES.map((l) => (
                <button key={l.id} type="button" aria-pressed={form.lifecycle_status === l.id} onClick={() => set("lifecycle_status", l.id as EventLifecycle)} className={cn("rounded-2xl border p-3 text-left text-sm", form.lifecycle_status === l.id ? "border-vip bg-vip/10" : "border-white/10 bg-white/[0.03]")}>
                  <span className="block font-semibold">{l.label}</span>
                  <span className="block text-xs text-muted">{l.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-2xl border border-white/10 p-4">
            <legend className="px-1 font-display text-[13px] font-semibold">Lotes / listas free</legend>
            <p className="text-xs text-muted">Hasta la hora límite entran gratis; después la puerta cobra el diferencial{flags.enableFreeCutoffConversion ? "" : " (módulo apagado: entran free a cualquier hora)"}.</p>
            <ul className="mt-3 space-y-2">
              {lists.map((l, i) => (
                <li key={l.id ?? i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_160px_auto]">
                  <TextField label="Lista" value={l.name} maxLength={60} onChange={(e) => set("lists", lists.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <TextField label="Free hasta (freeCutoffTime)" type="datetime-local" value={l.free_until ? toLocal(l.free_until) : ""} onChange={(e) => set("lists", lists.map((x, j) => (j === i ? { ...x, free_until: fromLocal(e.target.value) || null } : x)))} />
                  <TextField label="Precio tardío ($)" inputMode="numeric" value={String(l.late_price)} onChange={(e) => set("lists", lists.map((x, j) => (j === i ? { ...x, late_price: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
                  {!l.id && (
                    <Button variant="ghost" size="icon" aria-label="Quitar lista" onClick={() => set("lists", lists.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="glass" className="mt-3" onClick={() => set("lists", [...lists, { name: "Lista Free", free_until: new Date(+new Date(form.starts_at) + 90 * 60_000).toISOString(), late_price: 8000 }])}>
              <Plus /> Agregar lista
            </Button>
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <fieldset className="rounded-2xl border border-white/10 p-4">
            <legend className="px-1 font-display text-[13px] font-semibold">Line-up / DJs</legend>
            <ul className="space-y-2">
              {lineup.map((sl, i) => (
                <li key={sl.id} className="grid items-end gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
                  <TextField label="Artista" value={sl.artist} onChange={(e) => set("lineup_json", lineup.map((x, j) => (j === i ? { ...x, artist: e.target.value } : x)))} />
                  <TextField label="Desde" type="time" value={toLocal(sl.starts_at).slice(11)} onChange={(e) => set("lineup_json", lineup.map((x, j) => (j === i ? { ...x, starts_at: withTime(form.starts_at, e.target.value) } : x)))} />
                  <TextField label="Hasta" type="time" value={toLocal(sl.ends_at).slice(11)} onChange={(e) => set("lineup_json", lineup.map((x, j) => (j === i ? { ...x, ends_at: withTime(form.starts_at, e.target.value, x.starts_at) } : x)))} />
                  <Button variant="ghost" size="icon" aria-label="Quitar set" onClick={() => set("lineup_json", lineup.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="glass"
              className="mt-3"
              onClick={() => {
                const last = lineup.at(-1);
                const from = last ? last.ends_at : form.starts_at;
                const slot: LineupSlot = { id: uid(), artist: "", starts_at: from, ends_at: new Date(+new Date(from) + 90 * 60_000).toISOString() };
                set("lineup_json", [...lineup, slot]);
              }}
            >
              <Plus /> Agregar set
            </Button>
          </fieldset>
          <fieldset className="space-y-3 rounded-2xl border border-white/10 p-4">
            <legend className="px-1 font-display text-[13px] font-semibold">Estética rápida</legend>
            <label className="block">
              <span className="mb-1.5 block font-display text-[13px] font-semibold">Marca</span>
              <select aria-label="Marca" value={form.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value || null)} className={select}>
                <option value="" className="bg-surface">Colores de ROUGE</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id} className="bg-surface">{b.name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Color principal" value={form.theme_primary} error={primaryErr} onChange={(v) => set("theme_primary", v)} />
              <ColorField label="Color de acento" value={form.theme_accent} error={accentErr} onChange={(v) => set("theme_accent", v)} />
            </div>
            <TextField label="Logo (URL)" value={form.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value.trim() || null)} placeholder="https://…/logo.webp" />
            <Link href="/admin/brand" className="inline-flex min-h-touch items-center gap-1.5 text-xs text-vip hover:underline">
              <Palette className="size-4" /> Abrir el estudio de marca (logo y vista previa)
            </Link>
          </fieldset>
        </div>
      )}

      {step === 3 && <FeatureModulesPanel value={flags} onChange={(f) => set("features", f)} />}

      {step === 4 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <dl className="space-y-2 rounded-2xl border border-white/10 p-4 text-sm">
            {[
              ["Evento", form.name],
              ["Link", `/join/${form.slug || "(se arma con el nombre)"}`],
              ["Organización", getProfile(state, form.organization_id)?.full_name ?? "—"],
              ["Estado", LIFECYCLES.find((l) => l.id === form.lifecycle_status)?.label ?? ""],
              ["Fechas", `${new Date(form.starts_at).toLocaleString("es-AR")} → ${new Date(form.ends_at).toLocaleString("es-AR")}`],
              ["Aforo", String(form.max_capacity)],
              ["Listas", lists.length ? lists.map((l) => `${l.name} (${formatMoney(l.late_price)} tarde)`).join(" · ") : "—"],
              ["Line-up", lineup.length ? lineup.map((l) => l.artist).join(" · ") : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-28 shrink-0 text-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="mb-2 font-display text-sm font-semibold">Módulos</p>
            <div className="flex flex-wrap gap-1.5">
              {FEATURES.map((f) => (
                <Badge key={f.key} tone={flags[f.key] ? "squad" : "neutral"}>
                  {flags[f.key] ? "✓" : "✕"} {f.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {stepError && <p role="alert" className="text-sm text-rouge">{stepError}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {step > 0 && (
            <Button variant="glass" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Atrás
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="vip" disabled={!!stepError} onClick={() => setStep(step + 1)}>
              Siguiente <ArrowRight />
            </Button>
          ) : (
            <Button variant="vip" disabled={busy} onClick={save}>
              <Save /> {event ? "Guardar cambios" : "Crear evento"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Hora HH:MM del set, en la noche del evento (si es antes de la hora de inicio, cae al día siguiente). */
function withTime(eventStart: string, hhmm: string, after?: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(eventStart);
  d.setHours(h, m, 0, 0);
  if (+d < +new Date(eventStart) - 3 * 3_600_000) d.setDate(d.getDate() + 1);
  if (after && +d <= +new Date(after)) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function ColorField({ label, value, error, onChange }: { label: string; value: string | null | undefined; error: string | null; onChange: (v: string | null) => void }) {
  return (
    <div>
      <span className="mb-1.5 block font-display text-[13px] font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value ?? "#FF1E56"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-11 shrink-0 cursor-pointer rounded-xl border border-white/10 bg-transparent" />
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value.trim() || null)} placeholder="ROUGE" className="min-h-touch w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 font-mono text-sm" aria-label={`${label} (hex)`} />
      </div>
      {error && <p className="mt-1 text-xs text-rouge">{error}</p>}
    </div>
  );
}
