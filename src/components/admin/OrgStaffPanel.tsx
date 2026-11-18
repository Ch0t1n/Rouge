"use client";

import * as C from "@/lib/store/commands";
import { useMemo, useState } from "react";
import { Clock4, KeyRound, Link2, Power, QrCode, ShieldOff, UserPlus } from "lucide-react";
import type { StaffRole, StaffScope } from "@/lib/types";
import { INVITABLE_ROLES, inviteStatus, organizationEvents, staffInviteLink, staffMatrix, WINDOWED_ROLES } from "@/lib/engine/security";
import { accessWindowOf, PLATFORM_ROLE, ROLE_META } from "@/lib/engine/roles";
import { getProfile } from "@/lib/engine/selectors";
import { useNow, useRouge } from "@/lib/store/RougeContext";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { useShare } from "@/components/share/ShareSheet";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const PLATFORM_LABEL = { owner: "Dueño/a", manager: "Producción · panel", door_scanner: "Puerta · /ops/door", bar_pos: "Barra · /ops/bar", rrpp: "RRPP · su link" } as const;
const select = "min-h-touch rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-vip/50";

/**
 * Staff de MI organización (solo dueño/a): invitaciones de 1 uso por link/QR (2 h), rol, alcance (todos mis eventos o
 * algunos) y ventana horaria automática; matriz con estado en vivo y kill switch (baja inmediata).
 */
export function OrgStaffPanel() {
  const { state, exec, notify } = useRouge();
  const now = useNow(30_000);
  const orgId = state.current_user_id;
  const events = organizationEvents(state, orgId);
  const [role, setRole] = useState<Exclude<StaffRole, "owner">>("bartender");
  const [scope, setScope] = useState<StaffScope>("specific_events");
  const [picked, setPicked] = useState<string[]>([state.active_event_id]);
  const [windowed, setWindowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const share = useShare();
  const rows = useMemo(() => staffMatrix(state, orgId, now), [state, orgId, now]);
  const invites = (state.staff_invites ?? []).filter((i) => i.organization_id === orgId).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 8);
  const current = events.find((e) => e.id === state.active_event_id);
  const win = current ? accessWindowOf(current) : null;

  const invite = async () => {
    setBusy(true);
    const r = await exec(C.createStaffInvite({ role, scope, eventIds: scope === "specific_events" ? picked : [], accessWindow: windowed }));
    setBusy(false);
    if (!r.ok) return;
    share.open({
      url: staffInviteLink(r.data.token),
      title: `Invitación de staff · ${ROLE_META[role].label}`,
      text: `Sumate al staff como ${ROLE_META[role].label} en ROUGE. El link sirve una sola vez y vence en 2 horas.`,
      fileName: `rouge-staff-${role}`,
      accent: "vip",
      caption: "1 uso · vence en 2 h",
    });
    notify({ tone: "vip", title: "Invitación creada", description: "Compartila ahora: el link no se vuelve a mostrar (solo guardamos su huella)." });
  };

  const kill = async (userId: string) => {
    const r = await exec(C.revokeStaffAccess(userId));
    setConfirm(null);
    if (r.ok) notify({ tone: "rouge", title: "Acceso revocado", description: "Perdió todos los permisos de tu organización en el acto." });
  };

  return (
    <Panel title="Staff de tu organización" action={<Badge tone="vip">Solo dueño/a</Badge>}>
      {share.sheet}
      <p className="text-sm text-muted">Invitá por link o QR de un solo uso. Puerta y Barra operan solo en <b className="text-primary">/ops</b> y no ven lobby, CRM ni finanzas.</p>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Rol</span>
          <select
            aria-label="Rol del staff"
            value={role}
            onChange={(e) => {
              const r = e.target.value as Exclude<StaffRole, "owner">;
              setRole(r);
              setWindowed(WINDOWED_ROLES.includes(r));
            }}
            className={cn(select, "w-full")}
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r} className="bg-surface">
                {ROLE_META[r].emoji} {ROLE_META[r].label} — {PLATFORM_LABEL[PLATFORM_ROLE[r]]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Alcance</span>
          <select aria-label="Alcance" value={scope} onChange={(e) => setScope(e.target.value as StaffScope)} className={cn(select, "w-full")}>
            <option value="all_org_events" className="bg-surface">Todos los eventos de mi organización (también los futuros)</option>
            <option value="specific_events" className="bg-surface">Solo algunos eventos</option>
          </select>
        </label>
        {scope === "specific_events" && (
          <fieldset className="lg:col-span-2">
            <legend className="mb-1.5 text-xs font-semibold text-muted">Eventos</legend>
            <div className="flex flex-wrap gap-2">
              {events.map((e) => {
                const on = picked.includes(e.id);
                return (
                  <button key={e.id} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))} className={cn("min-h-[40px] rounded-full border px-3 text-xs font-semibold", on ? "border-vip bg-vip/15 text-primary" : "border-white/15 text-muted")}>
                    {e.name} · {formatDateTime(e.starts_at)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="rounded-xl border border-white/10 px-3 lg:col-span-2">
          <Switch
            tone="squad"
            id="access-window"
            checked={windowed}
            onCheckedChange={setWindowed}
            label="Ventana horaria automática"
            description={win ? `Se activa 2 h antes de abrir y se apaga 1 h después del cierre (hoy: ${formatTime(new Date(win.from).toISOString())} → ${formatTime(new Date(win.to).toISOString())}).` : "Se activa 2 h antes de abrir cada evento y se apaga 1 h después del cierre."}
          />
        </div>
        <Button variant="vip" onClick={invite} disabled={busy || (scope === "specific_events" && !picked.length)} className="lg:col-span-2">
          <UserPlus /> Crear link de invitación (1 uso · 2 h)
        </Button>
      </div>

      {invites.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm" aria-label="Invitaciones recientes">
          {invites.map((i) => {
            const st = inviteStatus(i, now);
            return (
              <li key={i.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                <Link2 className="size-4 text-muted" />
                <span className="flex-1 truncate">
                  {ROLE_META[i.role].emoji} {ROLE_META[i.role].label} · {i.scope === "all_org_events" ? "todos los eventos" : `${i.event_ids.length} evento(s)`}
                  {i.used_by ? ` · la usó @${getProfile(state, i.used_by)?.username ?? "alguien"}` : ""}
                </span>
                <Badge tone={st === "valid" ? "squad" : st === "used" ? "vip" : "neutral"}>{st === "valid" ? `vence ${formatTime(i.expires_at)}` : st === "used" ? "usada" : st === "expired" ? "vencida" : "anulada"}</Badge>
                {st === "valid" && (
                  <Button size="sm" variant="ghost" onClick={() => exec(C.revokeStaffInvite(i.id))}>
                    Anular
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 overflow-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 pr-3">Integrante</th>
              <th className="px-3">Plataforma</th>
              <th className="px-3">Alcance</th>
              <th className="px-3">Ahora</th>
              <th className="px-3">PIN</th>
              <th className="py-2 pl-3 text-right">Baja</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = getProfile(state, r.user_id);
              return (
                <tr key={`${r.source}-${r.user_id}-${r.revoked_at ?? ""}`} className={cn("border-t border-white/5", r.revoked_at && "opacity-50")}>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      {p ? <Avatar profile={p} size={30} /> : <span className="size-[30px] rounded-full bg-white/10" />}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{p?.full_name ?? "Integrante"}</span>
                        <span className="block truncate text-xs text-muted">{ROLE_META[r.role].emoji} {ROLE_META[r.role].label}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 text-xs">{PLATFORM_LABEL[r.platform]}</td>
                  <td className="px-3 text-xs text-muted">
                    {r.scope === "all_org_events" ? "Todos los eventos" : `${r.event_ids.length} evento(s)`}
                    {r.access_window && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-squad">
                        <Clock4 className="size-3" /> ventana
                      </span>
                    )}
                  </td>
                  <td className="px-3">{r.revoked_at ? <Badge>revocado</Badge> : r.active_now ? <Badge tone="squad">activo</Badge> : <Badge>fuera de horario</Badge>}</td>
                  <td className="px-3">{r.has_pin ? <KeyRound className="size-4 text-vip" aria-label="Tiene PIN de terminal" /> : <span className="text-xs text-muted">—</span>}</td>
                  <td className="py-2 pl-3 text-right">
                    {!r.revoked_at && (
                      <Button size="sm" variant="danger" onClick={() => setConfirm(r.user_id)} aria-label={`Revocar el acceso de ${p?.full_name ?? "este integrante"}`}>
                        <Power /> Revocar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted">
                  Todavía no tenés staff. Creá un link de invitación arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BottomSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="¿Revocar el acceso ahora?"
        description="Kill switch: pierde en el acto todos los permisos en todos tus eventos (panel, puerta, barra y PIN de terminal). Queda registrado en la auditoría."
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="glass" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => confirm && kill(confirm)}>
              <ShieldOff /> Revocar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">{confirm && getProfile(state, confirm)?.full_name}</p>
      </BottomSheet>
    </Panel>
  );
}

/** Cada integrante (o el dueño/a) define su PIN para operar terminales en Modo Kiosco. */
export function TerminalPinPanel({ orgId }: { orgId: string }) {
  const { state, exec, notify } = useRouge();
  const [pin, setPin] = useState("");
  const has = (state.terminal_pins ?? []).some((p) => p.organization_id === orgId && p.user_id === state.current_user_id);
  return (
    <Panel title={<span className="flex items-center gap-2"><QrCode className="size-5 text-vip" /> Mi PIN de terminal</span>} action={has ? <Badge tone="squad">configurado</Badge> : <Badge>sin PIN</Badge>}>
      <p className="text-sm text-muted">En Modo Kiosco (tablet fija en barra o puerta) cada integrante opera con su PIN: así queda registrado quién entregó cada pedido o escaneó cada entrada.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await exec(C.setTerminalPin(orgId, pin));
          if (r.ok) {
            setPin("");
            notify({ tone: "squad", title: "PIN guardado", description: "No lo compartas: cada acción queda a tu nombre." });
          }
        }}
      >
        <input inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="PIN de 4 a 6 números" placeholder="4 a 6 números" className="min-h-touch w-40 rounded-xl border border-white/10 bg-white/[0.04] px-3 font-display tracking-[0.4em] placeholder:tracking-normal" type="password" />
        <Button type="submit" variant="vip" disabled={pin.length < 4}>
          {has ? "Cambiar PIN" : "Guardar PIN"}
        </Button>
      </form>
    </Panel>
  );
}
