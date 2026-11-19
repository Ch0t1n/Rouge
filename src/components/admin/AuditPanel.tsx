"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import type { AuditAction } from "@/lib/types";
import { auditFor } from "@/lib/engine/security";
import { getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { formatDateTime } from "@/lib/utils";
import { downloadCSV, Panel } from "@/components/admin/AdminChrome";
import { Button } from "@/components/ui/button";
import { toCSV } from "@/lib/utils";

export const AUDIT_LABEL: Record<AuditAction, string> = {
  "staff.invited": "Invitación de staff",
  "staff.joined": "Alta de staff",
  "staff.revoked": "Baja de staff",
  "staff.role_changed": "Cambio de rol",
  "staff.pin_set": "PIN de terminal",
  "kiosk.unlocked": "Kiosco desbloqueado",
  "kiosk.failed": "PIN incorrecto en kiosco",
  "door.check_in": "Ingreso en puerta",
  "door.rejected": "Rechazo en puerta",
  "bar.delivered": "Entrega en barra",
  "perk.redeemed": "QR canjeado",
  "courtesy.issued": "Cortesía emitida",
  "menu.price_changed": "Cambio de precio",
  "code.revoked": "Entrada anulada",
  "attendee.removed": "Expulsión",
  "report.created": "Reporte",
  "account.deleted": "Cuenta borrada",
  "event.created": "Evento creado",
  "event.updated": "Evento editado",
  "event.modules_changed": "Módulos del evento",
};

/** Auditoría inmutable de la organización (altas/bajas, cortesías, precios, anulaciones, kiosco). Exportable. */
export function AuditPanel({ orgId }: { orgId: string }) {
  const { state } = useRouge();
  const [filter, setFilter] = useState<"all" | "staff" | "money" | "ops">("all");
  const rows = useMemo(() => {
    const all = auditFor(state, orgId);
    const groups: Record<typeof filter, (a: AuditAction) => boolean> = {
      all: () => true,
      staff: (a) => a.startsWith("staff.") || a.startsWith("kiosk."),
      money: (a) => a === "menu.price_changed" || a === "courtesy.issued" || a === "code.revoked",
      ops: (a) => a.startsWith("door.") || a.startsWith("bar.") || a === "perk.redeemed",
    };
    return all.filter((r) => groups[filter](r.action));
  }, [state, orgId, filter]);
  const name = (id: string | null) => (id ? (getProfile(state, id)?.full_name ?? id.slice(0, 8)) : "—");
  return (
    <Panel
      title={<span className="flex items-center gap-2"><History className="size-5 text-vip" /> Auditoría</span>}
      action={
        <Button size="sm" variant="glass" onClick={() => downloadCSV("rouge-auditoria.csv", toCSV(rows.map((r) => ({ fecha: r.created_at, accion: AUDIT_LABEL[r.action] ?? r.action, cuenta: name(r.actor_id), opero: name(r.operator_id), objetivo: r.target ?? "", detalle: JSON.stringify(r.details) }))))}>
          Exportar CSV
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">Registro inmutable: nadie (ni el dueño/a) puede editarlo ni borrarlo.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["all", "Todo"],
            ["staff", "Staff y kiosco"],
            ["money", "Precios, cortesías y anulaciones"],
            ["ops", "Puerta y barra"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={filter === k ? "min-h-[36px] rounded-full bg-vip px-3 text-xs font-semibold text-background" : "min-h-[36px] rounded-full bg-white/[0.05] px-3 text-xs font-semibold text-muted"}>
            {l}
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 pr-3">Cuándo</th>
              <th className="px-3">Acción</th>
              <th className="px-3">Cuenta</th>
              <th className="px-3">Operó (PIN)</th>
              <th className="px-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted">{formatDateTime(r.created_at)}</td>
                <td className="px-3 font-semibold">{AUDIT_LABEL[r.action] ?? r.action}</td>
                <td className="px-3">{name(r.actor_id)}</td>
                <td className="px-3">{name(r.operator_id)}</td>
                <td className="max-w-[260px] truncate px-3 text-xs text-muted">{r.target ? `${r.target.length > 20 ? r.target.slice(0, 8) + "…" : r.target} ` : ""}{Object.entries(r.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted">
                  Sin movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
