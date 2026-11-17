"use client";

import { Briefcase, Link2 } from "lucide-react";
import type { BusinessNeed, ProfilePersona } from "@/lib/types";
import { industryLabel, needEmoji, needLabel, proHeadline } from "@/lib/engine/verticals";
import { cn } from "@/lib/utils";

/** Chips de "Busca" / "Ofrece" de un perfil profesional; resalta lo que se cruza con quien mira. */
export function NeedChips({ needs, highlight = [], tone = "squad" }: { needs: BusinessNeed[]; highlight?: string[]; tone?: "squad" | "vip" }) {
  if (!needs.length) return <p className="text-sm text-muted">—</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {needs.map((n) => {
        const on = highlight.includes(needLabel(n));
        return (
          <li
            key={n}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold",
              on ? (tone === "vip" ? "border-vip/60 bg-vip/15 text-vip" : "border-squad/60 bg-squad/15 text-squad") : "border-white/10 bg-white/[0.04] text-primary/85",
            )}
          >
            {needEmoji(n)} {needLabel(n)}
          </li>
        );
      })}
    </ul>
  );
}

/** Bloque del perfil profesional: cargo, empresa, rubro, qué busca y qué ofrece, LinkedIn. */
export function ProFacts({ persona, highlights = [] }: { persona: ProfilePersona; highlights?: string[] }) {
  const industry = industryLabel(persona.industry);
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-primary/80">
          <Briefcase className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display font-semibold leading-tight">{proHeadline(persona) || "Perfil profesional"}</p>
          {industry && <p className="text-sm text-muted">{industry}</p>}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm text-muted">Busca</h3>
        <NeedChips needs={persona.looking_for} highlight={highlights} tone="vip" />
      </div>
      <div>
        <h3 className="mb-2 text-sm text-muted">Ofrece</h3>
        <NeedChips needs={persona.offering} highlight={highlights} />
      </div>
      {persona.linkedin_url && (
        <a href={persona.linkedin_url} target="_blank" rel="noreferrer noopener" className="glass flex min-h-touch items-center gap-3 rounded-2xl px-4 py-2.5 transition hover:bg-white/10">
          <Link2 className="size-5 shrink-0 text-squad" />
          <span className="min-w-0 flex-1 truncate font-display font-semibold">LinkedIn</span>
          <span className="truncate text-xs text-muted">{persona.linkedin_url.replace("https://www.", "")}</span>
        </a>
      )}
    </section>
  );
}
