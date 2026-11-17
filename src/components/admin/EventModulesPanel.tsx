"use client";

import * as C from "@/lib/store/commands";
import { SlidersHorizontal } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { eventFeatures, FEATURES } from "@/lib/engine/features";
import { useRouge } from "@/lib/store/RougeContext";
import { Panel } from "@/components/admin/AdminChrome";
import { FeatureModulesPanel } from "@/components/admin/FeatureModulesPanel";
import { Badge } from "@/components/ui/badge";

/** Módulos del evento en /admin/events: editables con autogestión; si no, en solo lectura (los configura ROUGE). */
export function EventModulesPanel({ event, editable }: { event: RougeEvent; editable: boolean }) {
  const { state, exec, notify } = useRouge();
  const flags = eventFeatures(state, event.id);
  return (
    <Panel title={<span className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-vip" /> Módulos del evento</span>} action={editable ? <Badge tone="vip">Autogestión</Badge> : <Badge>Los configura ROUGE</Badge>}>
      {editable ? (
        <FeatureModulesPanel
          value={flags}
          onChange={async (next) => {
            const r = await exec(C.setEventFeatures(event.id, next));
            if (r.ok) notify({ tone: "squad", title: "Módulos actualizados", duration: 1600 });
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {FEATURES.map((f) => (
            <Badge key={f.key} tone={flags[f.key] ? "squad" : "neutral"}>
              {flags[f.key] ? "✓" : "✕"} {f.label}
            </Badge>
          ))}
        </div>
      )}
    </Panel>
  );
}
