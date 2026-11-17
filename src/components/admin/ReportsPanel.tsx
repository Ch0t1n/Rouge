"use client";

import * as C from "@/lib/store/commands";
import { useEffect, useRef } from "react";
import { Check, Flag } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { openReports, REPORT_REASONS } from "@/lib/engine/security";
import { getProfile } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, timeAgo } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Reportes de asistentes en vivo (seguridad, dueño/a y producción). Avisa con un banner cuando entra uno nuevo. */
export function ReportsPanel({ event, dark = false }: { event: RougeEvent; dark?: boolean }) {
  const { state, exec, notify } = useRouge();
  const now = useNow(15_000);
  const reports = openReports(state, event.id);
  const seen = useRef(reports.length);
  useEffect(() => {
    if (reports.length > seen.current) notify({ tone: "rouge", title: "🚩 Nuevo reporte de un asistente", description: REPORT_REASONS.find((r) => r.id === reports[0]?.reason)?.label });
    seen.current = reports.length;
  }, [reports, notify]);
  return (
    <Panel
      className={cn(reports.length && "border-rouge/40", dark && "bg-black")}
      title={
        <span className="flex items-center gap-2">
          <Flag className={cn("size-5", reports.length ? "text-rouge" : "text-muted")} /> Reportes
        </span>
      }
      action={reports.length ? <Badge tone="live" size="md"><LiveDot /> {reports.length} abierto{reports.length > 1 && "s"}</Badge> : <Badge tone="squad" size="md">Sin reportes</Badge>}
    >
      {reports.length ? (
        <ul className="space-y-2">
          {reports.map((r) => {
            const who = getProfile(state, r.reported_user_id);
            return (
              <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-rouge/25 bg-rouge/[0.06] p-3">
                {who ? <Avatar profile={who} size={44} ring="rouge" /> : <span className="size-11 rounded-full bg-white/10" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{who?.full_name ?? "Asistente"} <span className="text-xs font-normal text-muted">@{who?.username}</span></p>
                  <p className="text-sm text-rouge">{REPORT_REASONS.find((x) => x.id === r.reason)?.label}</p>
                  {r.details && <p className="mt-0.5 text-sm text-primary/85">“{r.details}”</p>}
                  <p className="mt-0.5 text-xs text-muted">{timeAgo(r.created_at, now)} · quien reporta queda anónimo/a</p>
                </div>
                <Button size="sm" variant="glass" onClick={() => exec(C.reviewReport(r.id))}>
                  <Check /> Revisado
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Cuando alguien toque “Reportar” en un perfil, aparece acá al instante.</p>
      )}
    </Panel>
  );
}
