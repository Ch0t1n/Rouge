"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { LegalPage } from "@/components/legal/LegalPage";
import { Button } from "@/components/ui/button";

/**
 * Botón de Arrepentimiento (Res. 424/2020, Secretaría de Comercio Interior): revocar una compra dentro de los 10 días
 * corridos, sin registrarse ni dar motivos. Devuelve un código de seguimiento.
 */
export default function WithdrawalPage() {
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    if (!sb) {
      setCode(`ARR-DEMO${Math.random().toString(16).slice(2, 6).toUpperCase()}`);
    } else {
      const { data, error: err } = await sb.rpc("request_withdrawal", { p_email: email, p_order_ref: order || null, p_reason: reason || null });
      if (err) setError(friendlyError(err));
      else setCode(data as string);
    }
    setBusy(false);
  };
  return (
    <LegalPage title="Botón de arrepentimiento" updated="17 de noviembre de 2026">
      <p>Tenés derecho a revocar la compra de un producto o servicio contratado a distancia dentro de los <b>10 días corridos</b> desde la compra, sin dar explicaciones. No hace falta tener cuenta.</p>
      {code ? (
        <div role="status" className="rounded-3xl border border-squad/40 bg-squad/10 p-5">
          <p className="flex items-center gap-2 font-display text-lg font-bold text-squad"><CheckCircle2 className="size-5" /> Recibimos tu pedido</p>
          <p className="mt-2">Tu código de seguimiento es <b className="font-display text-xl tracking-wider">{code}</b>. Te escribimos dentro de las 24 h al email que indicaste.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Email de contacto *</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-touch w-full rounded-2xl border border-white/10 bg-background px-3" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Código del pedido o de la entrada (opcional)</span>
            <input value={order} onChange={(e) => setOrder(e.target.value)} maxLength={80} className="min-h-touch w-full rounded-2xl border border-white/10 bg-background px-3" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Comentario (opcional)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="w-full rounded-2xl border border-white/10 bg-background p-3" />
          </label>
          {error && <p className="text-sm text-rouge">{error}</p>}
          <Button type="submit" variant="rouge" disabled={busy || !email}>
            Me arrepiento de mi compra
          </Button>
        </form>
      )}
    </LegalPage>
  );
}
