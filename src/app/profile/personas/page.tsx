"use client";

import Link from "next/link";
import { Briefcase, ChevronRight, Moon, Plus } from "lucide-react";
import { MAX_PERSONAS, personasOf, proHeadline } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Mis perfiles: una cuenta, varias caras. El Perfil principal es el de la noche; los adicionales se eligen al
 * entrar a cada evento (en corporativo, uno profesional). En un evento solo se ve la cara elegida.
 */
export default function PersonasPage() {
  const me = useRequireProfile();
  const { state } = useRouge();
  if (!me) return null;
  const pro = personasOf(state, me.id, "corporate");
  const night = personasOf(state, me.id, "nightlife");
  const full = pro.length + night.length >= MAX_PERSONAS;

  return (
    <main className="pb-12">
      <PageHeader title="Mis perfiles" subtitle="Una cuenta, varias caras: elegís cuál mostrar en cada evento" backHref="/profile" />
      <div className="space-y-6 px-4">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm text-muted">
            <Moon className="size-4" /> Noche · ROUGE
          </h2>
          <Row href="/profile/edit" title="Perfil principal" subtitle={`@${me.username} · ${me.music_genres.join(" · ") || "sin géneros"}`} profile={me} badge="Principal" />
          {night.map((p) => (
            <Row key={p.id} href={`/profile/personas/edit?id=${p.id}`} title={p.label} subtitle={p.music_genres.join(" · ") || p.display_name} profile={{ full_name: p.display_name, photos: p.photos }} />
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm text-muted">
            <Briefcase className="size-4" /> Corporativo · ROUGE Pro
          </h2>
          {pro.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-muted">
              Para eventos de empresas, pymes y networking necesitás un perfil profesional. Ahí nadie ve tu perfil de la noche.
            </p>
          )}
          {pro.map((p) => (
            <Row key={p.id} href={`/profile/personas/edit?id=${p.id}`} title={p.label} subtitle={proHeadline(p) || p.display_name} profile={{ full_name: p.display_name, photos: p.photos }} />
          ))}
        </section>

        {full ? (
          <p className="text-center text-xs text-muted">Llegaste al máximo de {MAX_PERSONAS} perfiles adicionales.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link href="/profile/personas/edit?kind=corporate" className={buttonVariants({ variant: "rouge" })}>
              <Plus /> Profesional
            </Link>
            <Link href="/profile/personas/edit?kind=nightlife" className={buttonVariants({ variant: "glass" })}>
              <Plus /> Para la noche
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-muted/80">
          Tu teléfono, tus bloqueos y tu lista negra son de la cuenta: valen en todos tus perfiles.
        </p>
      </div>
    </main>
  );
}

function Row({ href, title, subtitle, profile, badge }: { href: string; title: string; subtitle: string; profile: { full_name: string; photos: { url: string; blur_color?: string }[] }; badge?: string }) {
  return (
    <Link href={href} className={cn("glass flex min-h-touch items-center gap-3 rounded-2xl p-3 transition hover:bg-white/10")}>
      <Avatar profile={profile} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{title}</span>
          {badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">{badge}</span>}
        </span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}
