"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Flag } from "lucide-react";
import type { Profile, ReportReason } from "@/lib/types";
import { REPORT_DETAILS_MAX, REPORT_REASONS } from "@/lib/engine/security";
import { useRouge } from "@/lib/store/RougeContext";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * "Reportar usuario": llega en vivo al panel de seguridad del evento. Quien reporta queda anónimo/a para la persona
 * reportada. Opción de bloquear en el mismo paso (invisibilidad mutua inmediata).
 */
export function ReportUserButton({ target, onDone, variant = "link", openExternally }: { target: Profile; onDone?: () => void; variant?: "link" | "button"; openExternally?: boolean }) {
  const { state, exec, notify } = useRouge();
  const [open, setOpen] = useState(!!openExternally);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  const send = async () => {
    if (!reason) return;
    const r = await exec(C.reportUser(target.id, state.active_event_id || null, reason, details, block));
    if (!r.ok) return;
    setOpen(false);
    notify({ tone: "info", title: "Gracias por avisar", description: block ? "Lo vio el equipo de seguridad y ya no se van a ver." : "Lo vio el equipo de seguridad del evento." });
    onDone?.();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(variant === "button" ? "flex min-h-touch w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-4 text-sm font-semibold text-primary hover:bg-white/10" : "inline-flex min-h-touch items-center gap-1.5 text-sm text-muted hover:text-rouge")}
      >
        <Flag className="size-4" /> Reportar
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Reportar a ${target.full_name.split(" ")[0]}`}
        description="Le llega al equipo de seguridad del evento al instante. No le avisamos que fuiste vos."
        footer={
          <Button block size="lg" variant="rouge" disabled={!reason} onClick={send}>
            <Flag /> Enviar reporte
          </Button>
        }
      >
        <div className="space-y-2" role="radiogroup" aria-label="Motivo">
          {REPORT_REASONS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} onClick={() => setReason(r.id)} className={cn("flex min-h-touch w-full items-center rounded-2xl border px-4 text-left text-sm font-semibold", reason === r.id ? "border-rouge bg-rouge/10" : "border-white/10 bg-white/[0.03]")}>
              {r.label}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Detalle (opcional)</span>
          <textarea value={details} maxLength={REPORT_DETAILS_MAX} onChange={(e) => setDetails(e.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm" placeholder="Contanos qué pasó" />
        </label>
        <div className="mt-2 rounded-2xl border border-white/10 px-3">
          <Switch tone="rouge" id="report-block" checked={block} onCheckedChange={setBlock} label="Bloquear también" description="Ninguno de los dos va a ver al otro en grilla, plano, squads ni chat." />
        </div>
      </BottomSheet>
    </>
  );
}
