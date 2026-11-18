"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { CorporateScheduleView } from "@/components/pro/CorporateScheduleView";
import { buttonVariants } from "@/components/ui/button";
import { activeEvent } from "@/lib/engine/selectors";
import { hasFeature } from "@/lib/engine/verticals";
import { useRequireProfile } from "@/lib/store/hooks";
import { useRouge } from "@/lib/store/RougeContext";

export default function AgendaPage() {
  const me = useRequireProfile();
  const { state } = useRouge();
  const event = activeEvent(state);
  if (!me || !event) return null;
  if (!hasFeature(state, event.id, "agenda")) {
    return (
      <main className="safe-top flex min-h-[80dvh] flex-col items-center justify-center gap-3 px-8 text-center">
        <CalendarDays className="size-10 text-muted" />
        <h1 className="text-2xl">Este evento no tiene agenda de charlas</h1>
        <p className="text-sm text-muted">La agenda multi-track está en los eventos corporativos de ROUGE Pro.</p>
        <Link href="/app" className={buttonVariants({ size: "lg" })}>
          Volver al inicio
        </Link>
      </main>
    );
  }
  return <CorporateScheduleView event={event} />;
}
