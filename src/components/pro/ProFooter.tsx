import Link from "next/link";
import { Lock, ShieldCheck, Smartphone } from "lucide-react";
import { PRO_NAV } from "./content";
import { ModeSwitch } from "./ModeSwitch";
import { ProLogo } from "./ProNavbar";
import { PRO_SALES_EMAIL } from "./ProDemoForm";

/** Pie ejecutivo: links, sellos de seguridad (solo lo que la plataforma hace de verdad) y vuelta a ROUGE Nightlife. */
export function ProFooter() {
  return (
    <footer className="border-t border-pro-line bg-pro-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
        <div>
          <ProLogo />
          <p className="mt-4 max-w-sm text-sm text-pro-mist">La plataforma para eventos corporativos, congresos y comunidades: acreditación, networking con salas y analítica.</p>
          <ModeSwitch active="pro" variant="pro" className="mt-6" />
        </div>
        <nav aria-label="Secciones">
          <p className="font-pro-mono text-xs uppercase tracking-[0.2em] text-pro-mist">Plataforma</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {PRO_NAV.map((l) => (
              <li key={l.id}>
                <a href={`#${l.id}`} className="text-pro-mist transition hover:text-white">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#simulador" className="text-pro-mist transition hover:text-white">
                Simulador del organizador
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="font-pro-mono text-xs uppercase tracking-[0.2em] text-pro-mist">Contacto</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <a href="#demo" className="text-pro-mist transition hover:text-white">
                Solicitar demo
              </a>
            </li>
            {PRO_SALES_EMAIL && (
              <li>
                <a href={`mailto:${PRO_SALES_EMAIL}`} className="text-pro-mist transition hover:text-white">
                  {PRO_SALES_EMAIL}
                </a>
              </li>
            )}
            <li>
              <Link href="/admin" className="text-pro-mist transition hover:text-white">
                Acceso Organizadores
              </Link>
            </li>
            <li>
              <Link href="/" className="text-pro-mist transition hover:text-white">
                ROUGE Nightlife →
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-pro-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-xs text-pro-mist sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <ul className="flex flex-wrap gap-2" aria-label="Seguridad">
            {[
              { icon: <Lock className="size-3.5" />, text: "Seguridad por fila en la base de datos" },
              { icon: <ShieldCheck className="size-3.5" />, text: "Conexión cifrada (HTTPS)" },
              { icon: <Smartphone className="size-3.5" />, text: "Sin descargas: app web" },
            ].map((b) => (
              <li key={b.text} className="inline-flex items-center gap-1.5 rounded-full border border-pro-line px-3 py-1">
                <span className="text-pro-emerald">{b.icon}</span>
                {b.text}
              </li>
            ))}
          </ul>
          <p>© {new Date().getFullYear()} ROUGE · ROUGE PRO</p>
        </div>
      </div>
    </footer>
  );
}
