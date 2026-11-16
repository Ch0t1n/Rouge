"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Download, Link2, UserPlus } from "lucide-react";
import { promoterLinkOf, promoterStats, type PromoterStats } from "@/lib/engine/promoters";
import { can } from "@/lib/engine/roles";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { formatMoney, toCSV } from "@/lib/utils";
import { AdminHeader, downloadCSV, Panel } from "@/components/admin/AdminChrome";
import { ShareButton } from "@/components/share/ShareSheet";
import { Button, buttonVariants } from "@/components/ui/button";

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

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader
        title="RRPP"
        subtitle={manager ? "Cada RRPP tiene su link y su QR: quien entra por ahí queda a su nombre. Liquidás por ingreso." : "Tu link y tu QR para invitar a esta fiesta, y cuánta gente entró por vos."}
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
          <Stat label="A cobrar" value={formatMoney(stat?.to_pay ?? 0)} accent />
        </dl>
      </Panel>
    </div>
  );
}

function ManagerView({ stats }: { stats: PromoterStats[] }) {
  const { state, exec, notify } = useRouge();
  const event = activeEvent(state)!;
  const total = stats.reduce((a, s) => a + s.to_pay, 0);
  const entries = stats.reduce((a, s) => a + s.entries, 0);

  const exportCsv = () => {
    const rows = stats.map((s) => {
      const p = getProfile(state, s.user_id);
      return { rrpp: p?.full_name ?? "", usuario: p ? `@${p.username}` : "", link: s.link ? joinPath(s.link.code) : "", ingresos_app: s.entries, ingresos_puerta: s.checked_in, liquidables: s.billable, comision_por_ingreso: s.link?.commission_per_entry ?? 0, a_pagar: s.to_pay };
    });
    downloadCSV(`rrpp-${event.slug}.csv`, toCSV(rows));
  };

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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 pr-3">RRPP</th>
              <th className="px-3">Link</th>
              <th className="px-3 text-right">App</th>
              <th className="px-3 text-right">Puerta</th>
              <th className="px-3">Comisión c/u</th>
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
                  <td className="metric pl-3 text-right text-vip">{formatMoney(s.to_pay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
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
