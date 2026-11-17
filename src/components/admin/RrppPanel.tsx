"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Download, Link2, UserPlus } from "lucide-react";
import { checkTiers, DEFAULT_TIERS, promoterBarSpend, promoterLinkOf, promoterStats, settlePromoter, type PromoterStats } from "@/lib/engine/promoters";
import type { CommissionTier } from "@/lib/types";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { TextField } from "@/components/ui/field";
import { can } from "@/lib/engine/roles";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { formatMoney, toCSV } from "@/lib/utils";
import { AdminHeader, downloadCSV, Panel } from "@/components/admin/AdminChrome";
import { ShareButton } from "@/components/share/ShareSheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { hasFeature } from "@/lib/engine/verticals";

const joinPath = (code: string) => `/join/${code}`;

/**
 * RRPP. El RRPP ve su link propio con QR y sus números (sin datos de las personas). Dueño/a y producción ven a todos,
 * generan links, fijan la comisión por ingreso y exportan la liquidación.
 */
export function RrppPanel() {
  const { state } = useRouge();
  const event = activeEvent(state)!;
  const me = state.current_user_id;
  const manager = can(state, event.id, me, "admin.events");
  const stats = promoterStats(state, event.id, me);

  if (!hasFeature(state, event.id, "promoters")) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-10 lg:py-10">
        <AdminHeader title="RRPP" subtitle="Los RRPP con link y comisión son de los eventos de noche." />
        <p className="glass rounded-2xl p-5 text-sm text-muted">
          Este es un evento corporativo (ROUGE Pro): la gente entra por el link del evento o por su código de 1 uso. Para medir de dónde
          viene cada asistente usá los códigos con etiqueta (Eventos y accesos).
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="RRPP"
        subtitle={manager ? "Cada RRPP tiene su link y su QR: quien entra por ahí queda a su nombre. Liquidás con tramos por cantidad y % sobre la barra de sus invitados." : "Tu link y tu QR para invitar a esta fiesta, y cuánta gente entró por vos."}
      />
      {manager ? <ManagerView stats={stats} /> : <PromoterView stat={stats.find((s) => s.user_id === me) ?? null} />}
      {!manager && <p className="text-xs text-muted">Por privacidad no ves quiénes son: solo cuántos entraron y cuántos pasaron por la puerta.</p>}
      {manager && (
        <p className="text-xs text-muted">
          Si el evento usa el escáner de la puerta, la comisión se calcula por ingreso confirmado en la puerta (no por registrarse en la app).
        </p>
      )}
    </main>
  );
}

function PromoterView({ stat }: { stat: PromoterStats | null }) {
  const { state, exec } = useRouge();
  const event = activeEvent(state)!;
  const link = promoterLinkOf(state, event.id, state.current_user_id);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Tu link">
        {link ? (
          <div className="space-y-4" data-testid="rrpp-link">
            <div className="mx-auto w-fit rounded-3xl bg-white p-4">
              <QRCodeSVG value={`${origin}${joinPath(link.code)}`} size={200} level="M" bgColor="#FFFFFF" fgColor="#070709" aria-label="QR de tu link" />
            </div>
            <p className="break-all text-center font-display text-lg font-bold">
              {origin.replace(/^https?:\/\//, "")}
              {joinPath(link.code)}
            </p>
            <ShareButton
              block
              variant="vip"
              label="Compartir mi link"
              target={{ url: joinPath(link.code), title: `Entrá a ${event.name}`, text: `Entrá a ${event.name} con mi link 🔥`, fileName: `rrpp-${link.code}`, accent: "vip", caption: link.code }}
            />
          </div>
        ) : (
          <div className="space-y-3 text-sm text-muted">
            <p>Todavía no tenés link para esta fiesta.</p>
            <Button variant="vip" onClick={() => exec(C.ensurePromoterLink(event.id, state.current_user_id))}>
              <Link2 /> Generar mi link
            </Button>
          </div>
        )}
      </Panel>
      <Panel title="Tus números">
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Entraron por tu link" value={String(stat?.entries ?? 0)} />
          <Stat label="Pasaron por la puerta" value={String(stat?.checked_in ?? 0)} />
          <Stat label="Comisión por ingreso" value={formatMoney(stat?.link?.commission_per_entry ?? link?.commission_per_entry ?? 0)} />
          <Stat label="A cobrar" value={formatMoney(settlePromoter(stat?.link ?? link ?? null, stat?.billable ?? 0, promoterBarSpend(state, event.id, state.current_user_id)).total)} accent />
        </dl>
      </Panel>
    </div>
  );
}

function ManagerView({ stats }: { stats: PromoterStats[] }) {
  const { state, exec, notify } = useRouge();
  const event = activeEvent(state)!;
  const [editing, setEditing] = useState<string | null>(null);
  const settle = (s: PromoterStats) => settlePromoter(s.link, s.billable, promoterBarSpend(state, event.id, s.user_id));
  const total = stats.reduce((a, s) => a + settle(s).total, 0);
  const entries = stats.reduce((a, s) => a + s.entries, 0);

  /** Liquidación final lista para pagar: fijo + tramos + % de barra, con el detalle por tramo. */
  const exportCsv = () => {
    const rows = stats.map((s) => {
      const p = getProfile(state, s.user_id);
      const st = settle(s);
      return {
        rrpp: p?.full_name ?? "",
        usuario: p ? `@${p.username}` : "",
        link: s.link ? joinPath(s.link.code) : "",
        ingresos_app: s.entries,
        ingresos_puerta: s.checked_in,
        liquidables: s.billable,
        precio_entrada: s.link?.ticket_price ?? 0,
        tramos: st.tiers.map((t) => `${t.from}${t.to ? `-${t.to}` : "+"}: ${t.entries} x ${t.percent}% = ${t.amount}`).join(" | "),
        comision_entradas: st.tickets,
        fijo_por_ingreso: st.fixed,
        consumo_barra_referidos: st.bar_spend,
        pct_barra: s.link?.bar_commission_percent ?? 0,
        comision_barra: st.bar,
        total_a_pagar: st.total,
      };
    });
    downloadCSV(`liquidacion-rrpp-${event.slug}.csv`, toCSV(rows));
  };
  const editingLink = stats.find((s) => s.link?.id === editing)?.link ?? null;

  if (!stats.length) {
    return (
      <Panel>
        <div className="space-y-3 text-sm text-muted">
          <p>Todavía no hay RRPP en este evento. Sumalos al equipo con el rol <b className="text-primary">📣 RRPP</b> (primero se registran con su @usuario).</p>
          <Link href="/admin/events" className={buttonVariants({ variant: "vip", size: "sm" })}>
            <UserPlus /> Ir a Equipo
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={`${stats.length} RRPP · ${entries} ingresos · ${formatMoney(total)} a liquidar`}
      action={
        <Button size="sm" variant="glass" onClick={exportCsv}>
          <Download /> CSV
        </Button>
      }
    >
      <div className="max-h-[70dvh] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 bg-surface/95 text-left text-xs uppercase tracking-wider text-muted backdrop-blur">
            <tr>
              <th className="py-2 pr-3">RRPP</th>
              <th className="px-3">Link</th>
              <th className="px-3 text-right">App</th>
              <th className="px-3 text-right">Puerta</th>
              <th className="px-3">Fijo c/u</th>
              <th className="px-3">Esquema</th>
              <th className="pl-3 text-right">A pagar</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const p = getProfile(state, s.user_id);
              return (
                <tr key={s.user_id} className="border-t border-white/5" data-testid="rrpp-row">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">{p?.full_name ?? "RRPP"}</p>
                    {p && <p className="text-xs text-muted">@{p.username}</p>}
                  </td>
                  <td className="px-3">
                    {s.link ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{joinPath(s.link.code)}</span>
                        <ShareButton iconOnly size="sm" label="QR del link" target={{ url: joinPath(s.link.code), title: `Link de ${p?.full_name ?? "RRPP"}`, text: `Entrá a ${event.name}`, fileName: `rrpp-${s.link.code}`, accent: "vip", caption: s.link.code }} />
                      </div>
                    ) : (
                      <Button size="sm" variant="glass" onClick={() => exec(C.ensurePromoterLink(event.id, s.user_id))}>
                        <Link2 /> Generar link
                      </Button>
                    )}
                  </td>
                  <td className="metric px-3 text-right">{s.entries}</td>
                  <td className="metric px-3 text-right">{s.checked_in}</td>
                  <td className="px-3">{s.link && <CommissionInput linkId={s.link.id} value={s.link.commission_per_entry} onSaved={() => notify({ tone: "squad", title: "Comisión actualizada", duration: 1800 })} />}</td>
                  <td className="px-3 text-xs">
                    {s.link && (
                      <button type="button" onClick={() => setEditing(s.link!.id)} className="rounded-xl border border-white/10 px-2 py-1.5 text-left hover:border-vip/50">
                        {(s.link.commission_tiers ?? []).length ? (s.link.commission_tiers ?? []).map((t) => `${t.from}+: ${t.percent}%`).join(" · ") : "Sin tramos"}
                        {s.link.bar_commission_percent ? ` · barra ${s.link.bar_commission_percent}%` : ""}
                      </button>
                    )}
                  </td>
                  <td className="metric pl-3 text-right text-vip" title={`Entradas ${formatMoney(settle(s).tickets)} · fijo ${formatMoney(settle(s).fixed)} · barra ${formatMoney(settle(s).bar)}`}>
                    {formatMoney(settle(s).total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingLink && <SchemeEditor link={editingLink} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

/** Esquema escalonado: precio de la entrada, tramos marginales y % sobre la barra, con vista previa. */
function SchemeEditor({ link, onClose }: { link: NonNullable<PromoterStats["link"]>; onClose: () => void }) {
  const { exec, notify } = useRouge();
  const [price, setPrice] = useState(String(link.ticket_price ?? 0));
  const [tiers, setTiers] = useState<CommissionTier[]>(link.commission_tiers?.length ? link.commission_tiers : DEFAULT_TIERS);
  const [bar, setBar] = useState(String(link.bar_commission_percent ?? 0));
  const err = checkTiers(tiers);
  const preview = settlePromoter({ ...link, ticket_price: Number(price) || 0, commission_tiers: tiers, bar_commission_percent: Number(bar) || 0 }, 40, 300000);
  const save = async () => {
    const r = await exec(C.setPromoterScheme(link.id, { ticket_price: Number(price) || 0, tiers, bar_percent: Number(bar) || 0 }));
    if (r.ok) {
      notify({ tone: "vip", title: "Esquema guardado", duration: 1800 });
      onClose();
    }
  };
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Comisión escalonada"
      description="Tramos marginales: cada tramo paga su % solo por las entradas que caen en él."
      footer={
        <Button block variant="vip" onClick={save} disabled={!!err}>
          Guardar esquema
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Precio de la entrada ($)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          <TextField label="% sobre la barra de sus invitados" inputMode="decimal" value={bar} onChange={(e) => setBar(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-end gap-2">
              <TextField label="Desde la entrada" inputMode="numeric" value={String(t.from)} onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, from: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
              <TextField label="%" inputMode="decimal" value={String(t.percent)} onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)))} />
              <Button size="sm" variant="ghost" onClick={() => setTiers((cur) => cur.filter((_, j) => j !== i))} aria-label="Quitar tramo">
                ✕
              </Button>
            </div>
          ))}
          <Button size="sm" variant="glass" onClick={() => setTiers((cur) => [...cur, { from: (cur.at(-1)?.from ?? 0) + 30, percent: (cur.at(-1)?.percent ?? 10) + 5 }])}>
            + Agregar tramo
          </Button>
          {err && <p className="text-xs text-rouge">{err}</p>}
        </div>
        <div className="rounded-2xl border border-vip/30 bg-vip/[0.05] p-3 text-sm">
          <p className="font-semibold text-vip">Ejemplo: 40 ingresos y $300.000 de barra</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {preview.tiers.map((t) => (
              <li key={t.from}>
                {t.from}–{t.to ?? "∞"}: {t.entries} × {t.percent}% = {formatMoney(t.amount)}
              </li>
            ))}
            <li>Barra: {formatMoney(preview.bar)} · Fijo: {formatMoney(preview.fixed)}</li>
          </ul>
          <p className="metric mt-1 text-lg text-vip">Total {formatMoney(preview.total)}</p>
        </div>
      </div>
    </BottomSheet>
  );
}

function CommissionInput({ linkId, value, onSaved }: { linkId: string; value: number; onSaved: () => void }) {
  const { exec } = useRouge();
  const [v, setV] = useState(String(value));
  const save = async () => {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (n === value || !Number.isFinite(n)) return;
    const r = await exec(C.setPromoterCommission(linkId, n));
    if (r.ok) onSaved();
  };
  return (
    <input
      aria-label="Comisión por ingreso"
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="min-h-[40px] w-28 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-primary focus:border-vip/50 focus:outline-none"
    />
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={accent ? "metric mt-1 text-2xl text-vip" : "metric mt-1 text-2xl"}>{value}</dd>
    </div>
  );
}
