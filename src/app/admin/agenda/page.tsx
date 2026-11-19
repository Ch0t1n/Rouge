"use client";

import { AdminHeader } from "@/components/admin/AdminChrome";
import { OrganizerScheduleManager } from "@/components/pro/OrganizerScheduleManager";
import { activeEvent } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";

export default function AdminAgendaPage() {
  const { state } = useRouge();
  const event = activeEvent(state);
  return (
    <div className="space-y-6">
      <AdminHeader title="Agenda & Charlas" subtitle="Salas y tracks en paralelo, oradores, En Vivo con preguntas al orador y encuestas." />
      {event ? <OrganizerScheduleManager event={event} /> : <p className="text-sm text-muted">Elegí un evento.</p>}
    </div>
  );
}
