"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, Megaphone, QrCode, Ticket, Zap } from "lucide-react";
import type { UserPerkQR } from "@/lib/types";
import { blastsFor, redeemPerk } from "@/lib/engine/actions";
import { STATUS_META } from "@/lib/engine/bar";
import { activeEvent, ordersOf, perksOf } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { useRequireProfile } from "@/lib/store/hooks";
import { cn, formatTime, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { QrBlock } from "@/components/perks/QrCard";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants } from "@/components/ui/button";

const TYPE: Record<UserPerkQR["perk_type"], { label: string; icon: string }> = {
  free_drink: { label: "Trago gratis", icon: "🍹" },
  raffle_prize: { label: "Premio de sorteo", icon: "🏆" },
  fast_pass: { label: "Fila rápida", icon: "⚡" },
  gifted_drink: { label: "Trago regalado", icon: "🎁" },
};

export default function PerksPage() {
  const me = useRequireProfile();
  if (!me) return null;
  return <Wallet />;
}

function Wallet() {
  const { state, exec, mode, notify } = useRouge();
  const now = useNow(15_000);
  const event = activeEvent(state)!;
  const meId = state.current_user_id;
  const [tab, setTab] = useState<"qrs" | "avisos">("qrs");
  const [show, setShow] = useState<UserPerkQR | null>(null);
  const perks = perksOf(state, meId, event.id);
  const available = perks.filter((p) => p.status === "available");
  const redeemed = perks.filter((p) => p.status === "redeemed");
  const orders = ordersOf(state, meId, event.id).filter((o) => o.pickup_code && (o.status === "ready_qr" || o.status === "preparing" || o.status === "pending"));
  const blasts = useMemo(() => blastsFor(state, event.id, meId, now), [state, event.id, meId, now]);
  const live = show ? state.user_perks_qrs.find((p) => p.id === show.id) ?? show : null;

  return (
    <main className="pb-10">
      <PageHeader title="Mis Perks & QRs" subtitle={event.name} backHref="/app" />
      <div className="px-4">
        <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-white/[0.05] p-1">
          {(
            [
              ["qrs", `QRs · ${available.length + orders.length}`],
              ["avisos", `Avisos · ${blasts.length}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("min-h-[40px] rounded-xl font-display text-sm font-semibold", tab === k ? "bg-vip text-background shadow-glow-vip" : "text-muted")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "qrs" ? (
        <div className="space-y-3 px-4 pt-4">
          {orders.map((o) => (
            <Link key={o.id} href="/bar" className={cn("flex items-center gap-3 rounded-3xl border p-4", o.status === "ready_qr" ? "border-squad bg-squad/10 shadow-glow-squad" : "border-white/10 bg-white/[0.04]")}>
              <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-2xl">🧾</span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-display font-bold", o.status === "ready_qr" ? "text-squad" : "text-primary")}>{STATUS_META[o.status].label}</p>
                <p className="truncate text-sm text-muted">{o.items_json.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
              </div>
              <span className="metric text-lg text-vip">{o.pickup_code}</span>
            </Link>
          ))}

          {available.length === 0 && orders.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">
              Todavía no ganaste QRs. Armá tu Squad, participá de los sorteos o recibí un Rompehielos con trago 🍸
              <Link href="/squad" className={cn(buttonVariants({ variant: "vip", size: "sm" }), "mt-4")}>
                Armar mi Squad
              </Link>
            </div>
          )}

          {available.map((p) => (
            <button key={p.id} type="button" onClick={() => setShow(p)} className="relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-vip/40 bg-gradient-to-r from-vip/15 to-surface p-4 text-left shadow-glow-vip transition active:scale-[0.98]">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-vip text-3xl">{TYPE[p.perk_type].icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-vip">{TYPE[p.perk_type].label}</p>
                <p className="font-display font-bold leading-tight">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted">{timeAgo(p.created_at)}</p>
              </div>
              <QrCode className="size-7 shrink-0 text-vip" />
              <span aria-hidden className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-background" />
            </button>
          ))}

          {redeemed.length > 0 && (
            <section className="pt-3">
              <h2 className="mb-2 text-sm text-muted">Canjeados</h2>
              <ul className="space-y-2">
                {redeemed.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/5 p-3 opacity-60">
                    <span className="text-xl grayscale">{TYPE[p.perk_type].icon}</span>
                    <span className="flex-1 truncate text-sm line-through">{p.title}</span>
                    <span className="text-xs text-muted">{p.redeemed_at ? formatTime(p.redeemed_at) : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-3 px-4 pt-4">
          {blasts.length === 0 && <p className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">Sin avisos del organizador por ahora.</p>}
          {blasts.map((b) => {
            const left = b.expires_at ? Math.ceil((+new Date(b.expires_at) - now) / 60_000) : null;
            const expired = left !== null && left <= 0;
            return (
              <article key={b.id} className={cn("rounded-3xl border p-4", b.is_flash_promo && !expired ? "border-vip/50 bg-vip/10 shadow-glow-vip" : "border-white/10 bg-white/[0.04]", expired && "opacity-50")}>
                <div className="flex items-start gap-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", b.is_flash_promo ? "bg-vip text-background" : "bg-white/10 text-primary")}>
                    {b.is_flash_promo ? <Zap className="size-5" /> : <Megaphone className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">{b.title}</p>
                    <p className="mt-0.5 text-sm text-primary/85">{b.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      {timeAgo(b.created_at)}
                      {left !== null && (expired ? " · terminó" : ` · quedan ${left} min`)}
                    </p>
                  </div>
                </div>
                {b.cta_label && b.cta_link && !expired && (
                  <Link href={b.cta_link} className={cn(buttonVariants({ size: "sm", variant: b.is_flash_promo ? "vip" : "glass" }), "mt-3")}>
                    {b.cta_label}
                  </Link>
                )}
              </article>
            );
          })}
          <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-muted/70">
            <Bell className="size-3" /> Los avisos nuevos te llegan como banner arriba de la pantalla.
          </p>
        </div>
      )}

      <BottomSheet open={!!live} onClose={() => setShow(null)} title={live ? `${TYPE[live.perk_type].icon} ${live.title}` : ""} description={live?.status === "redeemed" ? "Ya fue canjeado." : "Mostrale este QR al bartender."}>
        {live && (
          <div className="space-y-4 pb-2">
            <QrBlock value={live.qr_code_string} dimmed={live.status === "redeemed"} label={live.title} />
            <p className="text-center font-display text-xs tracking-widest text-muted">{live.qr_code_string}</p>
            {mode === "demo" && live.status === "available" && (
              <Button
                block
                variant="glass"
                onClick={async () => {
                  const r = await exec(C.redeemPerk(live.id, { simulate: true }));
                  if (r.ok) notify({ tone: "vip", title: "✅ Canjeado en barra", description: "Simulación del escaneo del staff (Modo Demo)." });
                }}
              >
                <Ticket /> Simular escaneo del bartender
              </Button>
            )}
          </div>
        )}
      </BottomSheet>
    </main>
  );
}
