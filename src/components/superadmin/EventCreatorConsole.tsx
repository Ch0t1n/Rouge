"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { Pencil, Plus, SlidersHorizontal } from "lucide-react";
import type { UUID } from "@/lib/types";
import { LIFECYCLES, ownerSelfService } from "@/lib/engine/eventAdmin";
import { eventFeatures, FEATURES, matchingPreset, FEATURE_PRESETS } from "@/lib/engine/features";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { formatDateTime } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { EventBuilderWizard } from "@/components/admin/EventBuilderWizard";
import { FeatureModulesPanel } from "@/components/admin/FeatureModulesPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * ROUGE HQ: crea eventos para cualquier organización con el creador modular, los edita, prende/apaga módulos en vivo
 * y decide qué organizaciones pueden autogestionarse (el mismo creador aparece entonces en su /admin/events).
 */
export function EventCreatorConsole() {
  const { state, exec, notify, setActiveEvent } = useRouge();
  const [mode, setMode] = useState<{ kind: "new" } | { kind: "edit"; id: UUID } | { kind: "modules"; id: UUID } | null>(null);
  const events = [...state.events].sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  const orgs = useMemo(() => [...new Set([...state.events.map((e) => e.created_by).filter((x): x is UUID => !!x), ...(state.organization_settings ?? []).map((o) => o.organization_id)])], [state]);
  const editing = mode && mode.kind !== "new" ? state.events.find((e) => e.id === mode.id) : null;

  if (mode?.kind === "new" || mode?.kind === "edit") {
    return (
      <Panel title={mode.kind === "new" ? "Nuevo evento" : `Editar · ${editing?.name ?? ""}`}>
        <EventBuilderWizard
          key={mode.kind === "edit" ? mode.id : "new"}
          event={mode.kind === "edit" ? editing : null}
          defaultOrgId={orgs[0]}
          onCancel={() => setMode(null)}
          onDone={(id) => {
            setMode(null);
            setActiveEvent(id);
          }}
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel
        title="Eventos"
        action={
          <Button variant="vip" onClick={() => setMode({ kind: "new" })}>
            <Plus /> Crear evento
          </Button>
        }
      >
        <ul className="divide-y divide-white/5">
          {events.map((e) => {
            const f = eventFeatures(state, e.id);
            const preset = FEATURE_PRESETS.find((p) => p.id === matchingPreset(f));
            const on = FEATURES.filter((x) => f[x.key]).length;
            return (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.name}</p>
                    <p className="text-xs text-muted">
                      {getProfile(state, e.created_by)?.full_name ?? "—"} · {formatDateTime(e.starts_at)} · /join/{e.slug}
                    </p>
                  </div>
                  <Badge tone={e.lifecycle_status === "draft" ? "neutral" : e.lifecycle_status === "ended" ? "neutral" : "squad"}>{LIFECYCLES.find((l) => l.id === (e.lifecycle_status ?? "live"))?.label}</Badge>
                  <Badge tone="vip">{preset ? `${preset.emoji} ${preset.label}` : `${on}/${FEATURES.length} módulos`}</Badge>
                  <Button size="sm" variant="glass" onClick={() => setMode(mode?.kind === "modules" && mode.id === e.id ? null : { kind: "modules", id: e.id })}>
                    <SlidersHorizontal /> Módulos
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode({ kind: "edit", id: e.id })}>
                    <Pencil /> Editar
                  </Button>
                </div>
                {mode?.kind === "modules" && mode.id === e.id && (
                  <div className="mt-4 rounded-2xl border border-white/10 p-4">
                    <p className="mb-3 text-xs text-muted">Los cambios se aplican en vivo: la app de los asistentes, el panel y la operación se adaptan al instante.</p>
                    <FeatureModulesPanel
                      value={f}
                      onChange={async (next) => {
                        const r = await exec(C.setEventFeatures(e.id, next));
                        if (r.ok) notify({ tone: "squad", title: "Módulos actualizados", description: e.name, duration: 1600 });
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Organizaciones · autogestión">
        <p className="mb-3 text-sm text-muted">Con la autogestión activada, el dueño/a crea sus eventos y prende/apaga módulos desde su /admin/events con este mismo creador.</p>
        <ul className="divide-y divide-white/5">
          {orgs.map((id) => (
            <li key={id}>
              <Switch
                id={`self-${id}`}
                tone="vip"
                checked={ownerSelfService(state, id)}
                onCheckedChange={async (v) => {
                  const r = await exec(C.setOwnerSelfService(id, v));
                  if (r.ok) notify({ tone: "vip", title: v ? "Autogestión activada" : "Autogestión desactivada", description: getProfile(state, id)?.full_name, duration: 1800 });
                }}
                label={getProfile(state, id)?.full_name ?? id.slice(0, 8)}
                description={`@${getProfile(state, id)?.username ?? "—"} · ${state.events.filter((e) => e.created_by === id).length} evento(s)`}
              />
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
