"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Ticket } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/** Ingreso manual: el código impreso en la entrada o el que te pasó el organizador. */
export default function JoinCodePage() {
  const { state, mode, demoVisible } = useRouge();
  const router = useRouter();
  const [code, setCode] = useState("");
  const event = state.events.find((e) => e.id === state.active_event_id);
  const freeCode = event && state.event_invite_codes.find((c) => c.event_id === event.id && !c.is_used);
  const squad = event && state.squads.find((s) => s.event_id === event.id);

  return (
    <main>
      <PageHeader title="Entrar a un evento" subtitle="Link o código de tu entrada" backHref="/app" />
      <form
        className="space-y-4 px-5 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/join/${encodeURIComponent(code.trim())}`);
        }}
      >
        <TextField label="Código de acceso" placeholder="Ej: RG7300KA" autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} hint="Viene con tu entrada, o te lo pasó tu Squad." />
        <Button type="submit" block size="lg" disabled={!code.trim()}>
          Continuar <ArrowRight />
        </Button>
      </form>

      {mode === "demo" && demoVisible && event && (
        <section className="mx-5 mt-8 space-y-2 rounded-3xl border border-vip/25 bg-vip/[0.05] p-4">
          <h2 className="flex items-center gap-2 text-sm text-vip">
            <Ticket className="size-4" /> Links de prueba (Modo Demo)
          </h2>
          {[
            { href: `/join/${event.slug}`, label: "Link Maestro del evento", sub: `/join/${event.slug} · con cupo máximo` },
            ...(freeCode ? [{ href: `/join/${freeCode.code}`, label: "Código único de 1 uso", sub: `${freeCode.code} · entregado con la entrada` }] : []),
            ...(squad ? [{ href: `/join/${squad.invite_code}`, label: `Link de Squad · ${squad.name}`, sub: `${squad.invite_code} · entra y se suma al Squad` }] : []),
          ].map((l) => (
            <Link key={l.href} href={l.href} className="glass flex min-h-touch items-center gap-3 rounded-2xl px-4 py-2.5 hover:bg-white/10">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.label}</p>
                <p className="truncate font-display text-xs text-muted">{l.sub}</p>
              </div>
              <ArrowRight className="size-4 text-muted" />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
