import Link from "next/link";
import type { ReactNode } from "react";

/** Plantilla de las páginas legales (públicas, sin sesión). Texto base: revisar con asesoría legal antes de publicar. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="safe-top mx-auto max-w-2xl px-5 pb-16 pt-8">
      <Link href="/" className="font-display text-xl font-bold tracking-tight text-rouge">ROUGE</Link>
      <h1 className="mt-6 text-3xl">{title}</h1>
      <p className="mt-1 text-xs text-muted">Última actualización: {updated}</p>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-primary/90 [&_h2]:mt-8 [&_h2]:text-lg [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      <nav aria-label="Legales" className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-4 text-xs text-muted">
        <Link href="/legal/terminos" className="hover:text-primary">Términos y condiciones</Link>
        <Link href="/legal/privacidad" className="hover:text-primary">Política de privacidad</Link>
        <Link href="/legal/arrepentimiento" className="hover:text-primary">Botón de arrepentimiento</Link>
      </nav>
    </main>
  );
}
