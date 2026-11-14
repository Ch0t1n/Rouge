import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Botón táctil — mínimo 44px de alto (ergonomía nocturna, una mano). */
export const buttonVariants = cva(
  "inline-flex min-h-touch select-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 font-display text-[15px] font-semibold tracking-tight transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        rouge: "bg-rouge text-white shadow-glow-rouge hover:bg-rouge-hover",
        squad: "bg-squad text-background shadow-glow-squad hover:bg-squad-hover",
        vip: "bg-vip text-background shadow-glow-vip hover:bg-vip-hover",
        glass: "glass text-primary hover:bg-white/10",
        outline: "border border-white/15 bg-transparent text-primary hover:bg-white/5",
        ghost: "bg-transparent text-muted hover:bg-white/5 hover:text-primary",
        danger: "bg-rouge/15 text-rouge ring-1 ring-inset ring-rouge/40 hover:bg-rouge/25",
      },
      size: {
        sm: "min-h-[36px] rounded-xl px-3 text-[13px]",
        md: "",
        lg: "min-h-[52px] rounded-2xl px-6 text-base",
        icon: "size-11 rounded-full px-0",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "rouge", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, block, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
));
Button.displayName = "Button";
