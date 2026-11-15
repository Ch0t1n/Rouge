import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-display text-[11px] font-semibold uppercase tracking-wide",
  {
    variants: {
      tone: {
        rouge: "bg-rouge/15 text-rouge ring-1 ring-inset ring-rouge/35",
        squad: "bg-squad/15 text-squad ring-1 ring-inset ring-squad/35",
        vip: "bg-vip/15 text-vip ring-1 ring-inset ring-vip/35",
        neutral: "bg-white/8 text-muted ring-1 ring-inset ring-white/10",
        solid: "bg-rouge text-white",
        live: "bg-rouge text-white shadow-glow-rouge",
      },
      size: { sm: "px-2 py-0.5", md: "px-2.5 py-1" },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)} aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-current" />
    </span>
  );
}
