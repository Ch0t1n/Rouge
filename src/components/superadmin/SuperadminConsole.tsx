"use client";

import * as C from "@/lib/store/commands";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, DoorOpen, EyeOff, Lock, Power, Search, ShieldAlert, Ticket, UserX, Users } from "lucide-react";
import { globalAttendeeSearch, globalEventBoard, globalStaffMatrix, type GlobalAttendeeRow } from "@/lib/engine/superadmin";
import { isPlatformAdmin, ROLE_META } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { getSupabase } from "@/lib/supabase/client";
import { cn, formatMoney, formatTime } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { useShare } from "@/components/share/ShareSheet";
import { Badge, LiveDot } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

const PLATFORM_LABEL = { owner: "Dueño/a", manager: "Panel", door_scanner: "Puerta /ops", bar_pos: "Barra /ops", rrpp: "RRPP" } as const;
const PHASE: Record<string, { label: string; tone: "live" | "squad" | "neutral" | "vip" }> = {
  live: { label: "En vivo", tone: "live" },
  open: { label: "Lobby abierto", tone: "squad" },
  afterglow: { label: "After", tone: "squad" },
  upcoming: { label: "Próximo", tone: "vip" },
  expired: { label: "Terminado", tone: "neutral" },
};

/**
 * Centro de comando global: tablero de eventos y boliches, control transversal de asistentes y matriz de staff de
 * todas las organizaciones. Cada acción queda en la auditoría de la organización afectada.
 */
export function SuperadminConsole() {
  const { state, mode, signedIn } = useRouge();
  const now = useNow(15_000);
  const allowed = signedIn && isPlatformAdmin(state, state.current_user_id);
  const [tab, setTab] = useState<"events" | "people" | "staff">("events");
  if (!allowed) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="glass max-w-md rounded-3xl p-8 text-center">
          <Lock className="mx-auto size-8 text-vip" />
          <h1 className="mt-4 text-2xl">Consola global de ROUGE</h1>
          <p className="mt-2 text-sm text-muted">Solo para el equipo de ROUGE. {mode === "demo" ? "En la demo, entrá como @rouge.hq." : "Tu cuenta no es administradora global."}</p>
          <Link href={mode === "demo" ? "/demo/abrir?rol=hq&a=/superadmin" : "/login?as=staff"} className={cn(buttonVariants({ variant: "vip" }), "mt-5")}>
            {mode === "demo" ? "Entrar como ROUGE HQ" : "Ingresar"}
          </Link>
        </div>
      </main>
    );
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3 lg:px-10">
          <span className="font-display text-xl font-bold text-rouge">ROUGE <span className="text-vip">HQ</span></span>
          <Badge tone="vip" size="md">Consola global</Badge>
          <nav role="tablist" className="ml-auto flex gap-1 rounded-2xl bg-white/[0.05] p-1" aria-label="Módulos">
            {(
              [
                ["events", "Eventos y boliches", Building2],
                ["people", "Asistentes", Users],
                ["staff", "Staff", ShieldAlert],
              ] as const
            ).map(([k, label, Icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-sm font-semibold", tab === k ? "bg-vip text-background" : "text-muted hover:text-primary")}>
                <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>
          <span className="text-xs text-muted">{formatTime(new Date(now).toISOString())}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] space-y-6 px-5 py-6 lg:px-10">
        {tab === "events" && <EventsBoard now={now} />}
        {tab === "people" && <PeopleControl />}
        {tab === "staff" && <StaffMatrix now={now} />}
      </main>
    </div>
  );
}

function EventsBoard({ now }: { now: number }) {
  const { state } = useRouge();
  const rows = useMemo(() => state.superadmin?.events ?? globalEventBoard(state, now), [state, now]);
  const totals = rows.reduce((a, r) => ({ inside: a.inside + r.inside, bar: a.bar + r.bar_revenue, door: a.door + r.door_revenue, alerts: a.alerts + r.rescue_alerts + r.open_reports }), { inside: 0, bar: 0, door: 0, alerts: 0 });
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Personas adentro ahora", String(totals.inside)],
          ["Barra (todas las fiestas)", formatMoney(totals.bar)],
          ["Cobros en puerta", formatMoney(totals.door)],
          ["Alertas abiertas", String(totals.alerts)],
        ].map(([l, v], i) => (
          <div key={l} className={cn("glass rounded-3xl p-5", i === 3 && totals.alerts > 0 && "border-sos/50")}>
            <dt className="text-xs text-muted">{l}</dt>
            <dd className={cn("metric mt-1 text-3xl", i === 3 && totals.alerts > 0 && "text-sos")}>{v}</dd>
          </div>
        ))}
      </dl>
      <Panel title="Tablero global de eventos">
        <div className="max-h-[70dvh] overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface/95 text-left text-xs uppercase tracking-wider text-muted backdrop-blur">
              <tr>
                <th className="py-2 pr-3">Evento</th>
                <th className="px-3">Estado</th>
                <th className="px-3 text-right">Ingresados / Vendidos</th>
                <th className="px-3">Aforo</th>
                <th className="px-3 text-right">Puerta</th>
                <th className="px-3 text-right">Barra</th>
                <th className="px-3 text-right">Staff</th>
                <th className="pl-3">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.capacity ? Math.min(100, Math.round((r.inside / r.capacity) * 100)) : 0;
                return (
                  <tr key={r.event_id} className="border-t border-white/5">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-muted">{r.venue} · {r.organization}</p>
                    </td>
                    <td className="px-3"><Badge tone={PHASE[r.phase]?.tone ?? "neutral"}>{r.phase === "live" && <LiveDot />} {PHASE[r.phase]?.label ?? r.phase}</Badge></td>
                    <td className="metric px-3 text-right">{r.inside} / {r.sold}</td>
                    <td className="px-3">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Aforo">
                        <div className={cn("h-full rounded-full", pct > 90 ? "bg-sos" : "bg-squad")} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted">{pct}% de {r.capacity}</span>
                    </td>
                    <td className="metric px-3 text-right">{formatMoney(r.door_revenue)}</td>
                    <td className="metric px-3 text-right text-vip">{formatMoney(r.bar_revenue)}</td>
                    <td className="metric px-3 text-right">{r.staff_active}</td>
                    <td className="pl-3">
                      {r.rescue_alerts + r.open_reports ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-sos"><AlertTriangle className="size-4" /> {r.rescue_alerts} rescate · {r.open_reports} reporte</span>
                      ) : (
                        <span className="text-xs text-muted">Sin alertas</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function PeopleControl() {
  const { state, exec, mode, notify } = useRouge();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<GlobalAttendeeRow[]>([]);
  const share = useShare();
  useEffect(() => {
    if (mode !== "supabase" || q.trim().length < 2) return;
    const t = setTimeout(() => {
      void getSupabase()
        ?.rpc("superadmin_search", { p_q: q })
        .then((r) => setRemote(((r.data as GlobalAttendeeRow[]) ?? []).map((x) => ({ ...x, bar_spent: Number(x.bar_spent) }))));
    }, 300);
    return () => clearTimeout(t);
  }, [q, mode]);
  const rows = mode === "supabase" ? remote : globalAttendeeSearch(state, q);
  const act = async (p: Promise<{ ok: boolean }>, msg: string) => {
    if ((await p).ok) notify({ tone: "vip", title: msg, duration: 1800 });
  };
  return (
    <Panel title="Control global de asistentes">
      {share.sheet}
      <label className="relative block">
        <span className="sr-only">Buscar asistente</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, @usuario o código de entrada (todos los eventos)" className="min-h-touch w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-9 pr-3" />
      </label>
      <div className="mt-4 overflow-auto">
        <table className="w-full min-w-[1060px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 pr-3">Asistente</th>
              <th className="px-3">Evento</th>
              <th className="px-3">Puerta</th>
              <th className="px-3">Lobby</th>
              <th className="px-3 text-right">Barra</th>
              <th className="px-3">Squad</th>
              <th className="pl-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.event_id}-${r.user_id}`} className="border-t border-white/5">
                <td className="py-2 pr-3">
                  <p className="font-semibold">{r.full_name} {r.banned && <Badge tone="rouge">expulsado</Badge>}</p>
                  <p className="text-xs text-muted">@{r.username}</p>
                </td>
                <td className="px-3 text-xs">{r.event_name}</td>
                <td className="px-3 text-xs">{r.checked_in_at ? <span className="text-squad">Ingresó {formatTime(r.checked_in_at)}</span> : <span className="text-muted">No ingresó</span>}</td>
                <td className="px-3 text-xs">{r.visible_in_lobby ? "Visible" : <span className="text-muted">Oculto</span>}</td>
                <td className="metric px-3 text-right">{formatMoney(r.bar_spent)}</td>
                <td className="px-3 text-xs">{r.squad ?? "—"}</td>
                <td className="pl-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Link href={`/u/${r.username}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Ver perfil</Link>
                    <Button size="sm" variant="glass" disabled={!!r.checked_in_at || r.banned} onClick={() => act(exec(C.saCheckIn(r.event_id, r.user_id)), "Check-in manual registrado")}><DoorOpen /> Check-in</Button>
                    {r.code_id && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => share.open({ url: `/join/${state.event_invite_codes.find((c) => c.id === r.code_id)?.code ?? ""}`, title: `Entrada de ${r.full_name}`, fileName: `entrada-${r.username}`, accent: "vip" })}><Ticket /> Reenviar</Button>
                        <Button size="sm" variant="ghost" onClick={() => act(exec(C.saRevokeCode(r.code_id!)), "Entrada anulada")}>Revocar</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" disabled={!r.visible_in_lobby} onClick={() => act(exec(C.saHideFromLobby(r.event_id, r.user_id)), "Oculto del lobby")}><EyeOff /> Ocultar</Button>
                    <Button size="sm" variant="danger" disabled={r.banned} onClick={() => act(exec(C.saRemoveAttendee(r.event_id, r.user_id, true)), "Expulsado del evento")}><UserX /> Expulsar</Button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">{q.trim().length < 2 ? "Escribí al menos 2 letras." : "Sin resultados."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StaffMatrix({ now }: { now: number }) {
  const { state, exec, notify } = useRouge();
  const rows = useMemo(() => state.superadmin?.staff ?? globalStaffMatrix(state, now), [state, now]);
  return (
    <Panel title="Matriz global de staff">
      <div className="max-h-[70dvh] overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10 bg-surface/95 text-left text-xs uppercase tracking-wider text-muted backdrop-blur">
            <tr>
              <th className="py-2 pr-3">Organización</th>
              <th className="px-3">Integrante</th>
              <th className="px-3">Plataforma</th>
              <th className="px-3">Alcance</th>
              <th className="px-3">Ventana horaria</th>
              <th className="pl-3 text-right">Baja remota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = getProfile(state, r.user_id);
              return (
                <tr key={`${r.organization_id}-${r.user_id}-${i}`} className={cn("border-t border-white/5", r.revoked_at && "opacity-50")}>
                  <td className="py-2 pr-3 text-xs">{r.organization}</td>
                  <td className="px-3">
                    <p className="font-semibold">{p?.full_name ?? r.user_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted">{ROLE_META[r.role].emoji} {ROLE_META[r.role].label}</p>
                  </td>
                  <td className="px-3 text-xs">{PLATFORM_LABEL[r.platform ?? "manager"] ?? "—"}</td>
                  <td className="px-3 text-xs">{r.scope === "all_org_events" ? "Todos sus eventos" : `${r.event_ids.length} evento(s)`}</td>
                  <td className="px-3 text-xs">{r.access_window ? "2 h antes → 1 h después" : "Sin ventana"}{r.active_now !== undefined && <Badge tone={r.active_now ? "squad" : "neutral"} className="ml-2">{r.active_now ? "activo" : "inactivo"}</Badge>}</td>
                  <td className="pl-3 text-right">
                    {!r.revoked_at && (
                      <Button size="sm" variant="danger" onClick={async () => (await exec(C.saRevokeStaff(r.organization_id, r.user_id))).ok && notify({ tone: "rouge", title: "Acceso revocado en toda la organización" })}>
                        <Power /> Baja
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
