"use client";

import { EyeOff, ShieldCheck } from "lucide-react";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import Link from "next/link";
import { BlacklistManager } from "@/components/profile/BlacklistManager";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import { PrivacySettingsPanel } from "@/components/profile/PrivacySettingsPanel";

export default function PrivacyPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return (
    <main className="pb-12">
      <PageHeader title="Privacidad y bloqueos" subtitle="Vos decidís quién te ve y a quién no cruzarte" backHref="/profile" />
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
        <PrivacySettingsPanel />
        <BlacklistManager />
        <DeleteAccount />
        <nav aria-label="Legales" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <Link href="/legal/terminos" className="hover:text-primary">Términos y condiciones</Link>
          <Link href="/legal/privacidad" className="hover:text-primary">Política de privacidad</Link>
          <Link href="/legal/arrepentimiento" className="hover:text-primary">Botón de arrepentimiento</Link>
        </nav>
      </div>
    </main>
  );
}
