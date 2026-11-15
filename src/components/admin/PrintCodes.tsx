"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { formatDateTime } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Hoja imprimible con un QR por código de 1 uso libre (para la puerta, pulseras o
 * entradas físicas). En pantalla es oscura; al imprimir sale en blanco y negro.
 */
export function PrintCodes() {
  const { state } = useRouge();
  const params = useSearchParams();
  const event = state.events.find((e) => e.id === (params.get("event") ?? state.active_event_id));
  const [limit, setLimit] = useState(24);
  if (!event) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const free = state.event_invite_codes.filter((c) => c.event_id === event.id && !c.is_used && !c.revoked_at).sort((a, b) => a.code.localeCompare(b.code));
  const codes = free.slice(0, limit);

  return (
    <main className="min-h-screen px-5 py-6 print:bg-white print:p-0 print:text-black lg:px-10">
      {/* En papel: fondo blanco y sin la UI de la app */}
      <style>{`@media print { @page { margin: 12mm; } html, body, body > div, .bg-background { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-3 print:hidden">
        <Link href="/admin/events" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft /> Volver
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl">QRs de 1 uso · {event.name}</h1>
          <p className="text-sm text-muted">{free.length} códigos libres. Cada QR entra una sola vez: entregalos con cada entrada.</p>
        </div>
        <label className="text-sm text-muted">
          Cantidad{" "}
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="ml-1 min-h-touch rounded-xl border border-white/10 bg-white/[0.05] px-3 font-semibold text-primary">
            {[12, 24, 48, 96, 500].map((n) => (
              <option key={n} value={n} className="bg-surface">
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button variant="vip" onClick={() => window.print()} disabled={!codes.length}>
          <Printer /> Imprimir
        </Button>
      </div>

      {codes.length ? (
        <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:max-w-none print:grid-cols-4 print:gap-3">
          {codes.map((c) => (
            <li key={c.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border border-white/10 bg-white p-3 text-center text-[#070709] print:rounded-lg print:border-black/30">
              <p className="font-display text-xs font-bold tracking-tight text-[#FF1E56]">ROUGE</p>
              <p className="w-full truncate text-[10px] font-semibold">{event.name}</p>
              <QRCodeSVG value={`${origin}/join/${c.code}`} size={132} level="M" marginSize={1} bgColor="#FFFFFF" fgColor="#070709" className="my-2 h-auto w-full max-w-[132px]" />
              <p className="font-display text-lg font-bold tracking-[0.15em]">{c.code}</p>
              <p className="text-[9px] text-black/60">1 uso · {formatDateTime(event.starts_at)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-auto max-w-5xl rounded-2xl border border-white/10 p-8 text-center text-muted">
          No hay códigos libres. Generá un lote en <Link href="/admin/events" className="text-vip underline">Eventos y accesos</Link>.
        </p>
      )}
    </main>
  );
}
