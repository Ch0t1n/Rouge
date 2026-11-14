"use client";

import { EyeOff, ShieldCheck } from "lucide-react";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { BlacklistManager } from "@/components/profile/BlacklistManager";

export default function PrivacyPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <main className="pb-12">
      <PageHeader title="Privacidad y bloqueos" subtitle="Vos decidís a quién no cruzarte" backHref="/profile" />
      <div className="space-y-6 px-5 pt-2">
        <div className="space-y-3 rounded-3xl border border-squad/25 bg-squad/[0.05] p-4">
          <div className="flex gap-3">
            <ShieldCheck className="size-6 shrink-0 text-squad" />
            <div>
              <h2 className="text-base">Invisibilidad mutua</h2>
              <p className="mt-1 text-sm text-primary/85">
                Si bloqueás a alguien —por perfil o por número de teléfono— ninguno de los dos ve al otro en la grilla, búsquedas, squads, el plano ni el chat. En todos los eventos, para siempre.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <EyeOff className="size-6 shrink-0 text-squad" />
            <p className="text-sm text-primary/85">
              Nunca avisamos a la otra persona ni te decimos si su número tiene cuenta. Tu teléfono jamás se muestra a otros asistentes.
            </p>
          </div>
        </div>
        <BlacklistManager />
      </div>
    </main>
  );
}
