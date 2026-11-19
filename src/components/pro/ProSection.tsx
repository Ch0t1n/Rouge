import type { ReactNode } from "react";
import { Briefcase, UserRound } from "lucide-react";
import type { ProAudience } from "./content";
import { cn } from "@/lib/utils";

/** Sección de /pro: alterna oscuro (navy/slate) y claro (alabaster) para lectura ejecutiva. */
export function ProSection({ id, tone, children, className, labelledBy }: { id?: string; tone: "dark" | "slate" | "light"; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "scroll-mt-16 py-20 lg:py-28",
        tone === "dark" && "bg-pro-navy text-white",
        tone === "slate" && "bg-pro-slate text-white",
        tone === "light" && "bg-pro-alabaster text-pro-ink",
        className,
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

export function ProHeading({ id, kicker, title, text, tone, align = "left" }: { id?: string; kicker: string; title: string; text?: string; tone: "dark" | "light"; align?: "left" | "center" }) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <p className={cn("font-pro-mono text-xs uppercase tracking-[0.22em]", tone === "dark" ? "text-pro-gold" : "text-pro-cobalt")}>{kicker}</p>
      <h2 id={id} className="mt-3 font-pro text-3xl font-bold leading-tight tracking-[-0.02em] sm:text-[2.6rem]">
        {title}
      </h2>
      {text && <p className={cn("mt-4 text-base leading-relaxed sm:text-lg", tone === "dark" ? "text-pro-mist" : "text-pro-ink-soft")}>{text}</p>}
    </div>
  );
}

/** Marca de algo que todavía no está disponible: nunca se vende como existente. */
export function Soon({ dark }: { dark?: boolean }) {
  return (
    <span className={cn("ml-1.5 inline-flex rounded-full border px-1.5 py-px font-pro-mono text-[9px] font-semibold uppercase tracking-wider", dark ? "border-pro-gold/40 text-pro-gold" : "border-pro-gold-deep/30 text-pro-gold-deep")}>
      Próximamente
    </span>
  );
}

/** Etiqueta de audiencia: separa siempre lo que gana quien ORGANIZA de lo que gana quien ASISTE. */
export function AudienceTag({ audience, dark }: { audience: ProAudience; dark?: boolean }) {
  const org = audience === "organizers";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 font-pro-mono text-[11px] font-semibold uppercase tracking-[0.14em]",
        org ? (dark ? "border-pro-sapphire/40 bg-pro-cobalt/20 text-white" : "border-pro-cobalt/30 bg-pro-cobalt/10 text-pro-cobalt") : dark ? "border-pro-emerald/40 bg-pro-emerald/15 text-white" : "border-pro-emerald/30 bg-pro-emerald/10 text-pro-emerald",
      )}
    >
      {org ? <Briefcase className="size-3.5" /> : <UserRound className="size-3.5" />}
      {org ? "Para organizadores" : "Para asistentes"}
    </span>
  );
}
