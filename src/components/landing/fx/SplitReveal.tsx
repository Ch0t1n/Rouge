"use client";

import { useRef, type ElementType } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../core/gsap";

export type RevealLine = string | { text: string; className?: string };

/**
 * Tipografía cinética: divide el texto en líneas → palabras/caracteres (en React, sin tocar
 * el DOM a mano) y los revela desde abajo con máscara. `trigger="scroll"` lo dispara al entrar
 * en pantalla; `"load"` al montar. El texto completo queda en `aria-label` para lectores.
 */
export function SplitReveal({
  lines,
  as: Tag = "h2",
  by = "words",
  trigger = "scroll",
  delay = 0,
  stagger,
  className,
  lineClassName,
}: {
  lines: RevealLine[];
  as?: ElementType;
  by?: "words" | "chars";
  trigger?: "scroll" | "load";
  delay?: number;
  stagger?: number;
  className?: string;
  lineClassName?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const items = lines.map((l) => (typeof l === "string" ? { text: l, className: undefined } : l));
  const label = items.map((l) => l.text).join(" ");

  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      const parts = ref.current.querySelectorAll("[data-part]");
      gsap.fromTo(
        parts,
        { yPercent: 115, rotate: by === "chars" ? 6 : 3 },
        {
          yPercent: 0,
          rotate: 0,
          duration: 1.1,
          ease: "expo.out",
          delay,
          stagger: stagger ?? (by === "chars" ? 0.022 : 0.07),
          scrollTrigger: trigger === "scroll" ? { trigger: ref.current, start: "top 85%", once: true } : undefined,
        },
      );
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} aria-label={label} className={className}>
      {items.map((line, li) => (
        <span key={li} aria-hidden className={["-mt-[0.14em] block overflow-hidden pb-[0.06em] pt-[0.14em]", lineClassName, line.className].filter(Boolean).join(" ")}>
          {line.text.split(" ").map((word, wi, arr) => (
            <span key={wi} className="inline-block whitespace-nowrap">
              {by === "chars" ? (
                word.split("").map((ch, ci) => (
                  <span key={ci} data-part className="inline-block will-change-transform">
                    {ch}
                  </span>
                ))
              ) : (
                <span data-part className="inline-block will-change-transform">
                  {word}
                </span>
              )}
              {wi < arr.length - 1 && <span className="inline-block">&nbsp;</span>}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}
