import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Switch de modo ROUGE Nightlife (/) ⇄ ROUGE PRO (/pro). Son dos links (navegación real, funciona sin JS).
 * `variant` adapta el estilo al header donde vive, sin mezclar paletas.
 */
export function ModeSwitch({ active, variant, className }: { active: "nightlife" | "pro"; variant: "nightlife" | "pro"; className?: string }) {
  const base = "inline-flex min-h-[32px] items-center rounded-full px-3 text-xs font-semibold transition";
  const on = variant === "pro" ? "bg-white text-pro-ink shadow-sm" : "bg-white/15 text-white";
  const off = variant === "pro" ? "text-pro-mist hover:text-white" : "text-white/60 hover:text-white";
  return (
    <nav aria-label="Modo de ROUGE" className={cn("inline-flex items-center gap-0.5 rounded-full border p-0.5", variant === "pro" ? "border-pro-line bg-pro-slate/80" : "border-white/15 bg-white/5", className)}>
      <Link href="/" aria-current={active === "nightlife" ? "page" : undefined} className={cn(base, active === "nightlife" ? on : off)}>
        Nightlife
      </Link>
      <Link href="/pro" aria-current={active === "pro" ? "page" : undefined} className={cn(base, active === "pro" ? on : off)}>
        PRO
      </Link>
    </nav>
  );
}
