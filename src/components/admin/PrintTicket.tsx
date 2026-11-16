"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { useRouge } from "@/lib/store/RougeContext";
import { DELIVERY_META, orderQrValue } from "@/lib/engine/bar";
import { eventTheme } from "@/lib/engine/branding";
import { getProfile } from "@/lib/engine/selectors";
import { formatMoney } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

/** Número corto y legible del pedido para el ticket (los últimos 6 del id). */
export const orderNumber = (id: string) => id.replace(/-/g, "").slice(-6).toUpperCase();

/**
 * Ticket / recibo de una comanda para impresora térmica de 80 mm (también sale bien en 58 mm y en A4).
 * Se abre desde cada comanda (Barra / POS) y lanza la impresión sola. `?copia=cliente` cambia el pie.
 * Comprobante interno: NO es factura (la facturación electrónica es aparte, ver docs/producto/competencia.md).
 */
export function PrintTicket() {
  const { state } = useRouge();
  const params = useSearchParams();
  const order = state.bar_orders.find((o) => o.id === params.get("order"));
  const event = order ? state.events.find((e) => e.id === order.event_id) : undefined;
  const printed = useRef(false);

  useEffect(() => {
    if (!order || printed.current || params.get("auto") === "0") return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 350); // deja dibujar el QR antes de abrir el diálogo
    return () => clearTimeout(t);
  }, [order, params]);

  if (!order || !event) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center text-sm text-muted">
        <p>
          No encontramos ese pedido. <Link href="/admin/bar-pos" className="text-vip underline">Volver a comandas</Link>
        </p>
      </main>
    );
  }

  const theme = eventTheme(state, event.id);
  const customer = getProfile(state, order.user_id);
  const copy = params.get("copia") === "cliente" ? "cliente" : "barra";
  const when = new Date(order.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const paid = order.payment_status === "paid";
  const sep = <div className="my-2 border-t border-dashed border-black" aria-hidden />;

  return (
    <main className="min-h-dvh bg-surface-sunken py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: 80mm auto; margin: 0; } html, body, body > div, .bg-background { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-4 flex w-[80mm] max-w-full flex-wrap items-center gap-2 px-2 print:hidden">
        <Link href="/admin/bar-pos" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft /> Comandas
        </Link>
        <Button size="sm" variant="vip" className="ml-auto" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
        <Link href={`/admin/print-ticket?order=${order.id}&copia=${copy === "barra" ? "cliente" : "barra"}&auto=0`} className={buttonVariants({ variant: "glass", size: "sm" })}>
          Copia {copy === "barra" ? "cliente" : "barra"}
        </Link>
      </div>

      <article className="mx-auto w-[80mm] max-w-full bg-white px-[5mm] py-[4mm] font-mono text-[12px] leading-snug text-black shadow-xl print:shadow-none" data-testid="ticket">
        <header className="text-center">
          <p className="font-display text-base font-bold uppercase tracking-tight">{theme.brand_name ?? "ROUGE"}</p>
          <p className="text-[11px]">{event.name}</p>
          {event.venue_name && <p className="text-[11px]">{event.venue_name}</p>}
        </header>
        {sep}
        <div className="flex justify-between font-bold">
          <span>COMANDA #{orderNumber(order.id)}</span>
          <span>{copy === "barra" ? "BARRA" : "CLIENTE"}</span>
        </div>
        <p>{when}</p>
        <p>Cliente: {customer?.full_name.split(" ")[0] ?? "—"}{customer?.username ? ` (@${customer.username})` : ""}</p>
        <p>
          {DELIVERY_META[order.delivery_type].label}
          {order.sector_name ? ` · ${order.sector_name}` : ""}
        </p>
        {order.pickup_code && <p className="mt-1 text-center font-display text-3xl font-bold tracking-[0.2em]">{order.pickup_code}</p>}
        {sep}
        <table className="w-full">
          <tbody>
            {order.items_json.map((i) => (
              <tr key={i.item_id} className="align-top">
                <td className="pr-1">{i.qty}×</td>
                <td className="w-full pr-1">{i.name.replace(/^\p{Extended_Pictographic}\s*/u, "")}</td>
                <td className="whitespace-nowrap text-right">{formatMoney(i.qty * i.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sep}
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(order.total_amount)}</span>
        </div>
        <p className="mt-1 font-bold">{paid ? "PAGADO · Mercado Pago" : order.payment_status === "awaiting_payment" ? "ESPERANDO PAGO" : "A COBRAR EN LA BARRA"}</p>
        {paid && order.payment_ref && <p className="text-[11px]">Operación {order.payment_ref}</p>}
        {order.split_user_ids.length > 0 && <p className="text-[11px]">Compartido entre {order.split_user_ids.length} del Squad</p>}
        {order.pickup_code && (
          <div className="mt-3 flex justify-center">
            <QRCodeSVG value={orderQrValue(order)} size={120} level="M" marginSize={1} bgColor="#FFFFFF" fgColor="#000000" aria-label="QR de retiro" />
          </div>
        )}
        {sep}
        <p className="text-center text-[10px]">{copy === "cliente" ? "¡Gracias! Mostrá el código en la ventanilla." : "Entregar contra código o QR."}</p>
        <p className="text-center text-[10px]">Comprobante no válido como factura · ROUGE</p>
      </article>
    </main>
  );
}
