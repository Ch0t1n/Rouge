"use client";

import { useState } from "react";
import { UserPlus, X } from "lucide-react";
import type { RougeEvent, StaffRole } from "@/lib/types";
import * as C from "@/lib/store/commands";
import { ROLE_META, STAFF_ROLES } from "@/lib/engine/roles";
import { useRouge } from "@/lib/store/RougeContext";
import { Panel } from "@/components/admin/AdminChrome";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const select = "min-h-touch rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-vip/50";

/** Equipo del evento: solo dueño/a suma, cambia o quita roles (RPC set_staff_role). */
export function TeamPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify, mode } = useRouge();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("bartender");
  const [busy, setBusy] = useState(false);
  const serverLookup = mode === "supabase";

  const creator = state.profiles.find((p) => p.id === event.created_by);
  const rows = state.event_staff
    .filter((r) => r.event_id === event.id && r.user_id !== event.created_by)
    .map((r) => ({ ...r, profile: state.profiles.find((p) => p.id === r.user_id) }))
    .sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));

  const apply = async (uname: string, next: StaffRole | null) => {
    setBusy(true);
    const r = await exec(C.setStaffRole(event.id, uname, next, { serverLookup }));
    setBusy(false);
    if (r.ok) {
      notify({ tone: "vip", title: next ? `${ROLE_META[next].emoji} @${uname.replace(/^@/, "")} ahora es ${ROLE_META[next].label}` : `@${uname} ya no es parte del equipo`, duration: 2200 });
      if (next) setUsername("");
    }
  };

  return (
    <Panel title="Equipo del evento">
      <p className="text-sm text-muted">Cada rol entra a su pantalla y solo puede hacer lo suyo. Sumá gente por su @usuario de ROUGE.</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) apply(username.trim(), role);
        }}
      >
        <div className="min-w-[180px] flex-1">
          <TextField label="@usuario" placeholder="dani.barra" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Rol</span>
          <select aria-label="Rol" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={select}>
            {STAFF_ROLES.filter((r) => r !== "owner").map((r) => (
              <option key={r} value={r} className="bg-surface">
                {ROLE_META[r].emoji} {ROLE_META[r].label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="vip" disabled={busy || !username.trim()}>
          <UserPlus /> Sumar
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">{ROLE_META[role].description}</p>

      <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/5">
        {creator && (
          <li className="flex items-center gap-3 px-4 py-3">
            <Avatar profile={creator} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{creator.full_name}</p>
              <p className="truncate text-xs text-muted">@{creator.username} · creó el evento</p>
            </div>
            <Badge tone="vip">{ROLE_META.owner.emoji} {ROLE_META.owner.label}</Badge>
          </li>
        )}
        {rows.map((r) => (
          <li key={r.user_id} className="flex items-center gap-3 px-4 py-3">
            {r.profile ? <Avatar profile={r.profile} size={36} /> : <div className="size-9 rounded-full bg-white/10" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{r.profile?.full_name ?? "Integrante"}</p>
              <p className="truncate text-xs text-muted">@{r.profile?.username ?? "—"}</p>
            </div>
            {r.profile && (
              <>
                <select aria-label={`Rol de @${r.profile.username}`} value={r.role} disabled={busy} onChange={(e) => apply(r.profile!.username, e.target.value as StaffRole)} className={select}>
                  {STAFF_ROLES.map((x) => (
                    <option key={x} value={x} className="bg-surface">
                      {ROLE_META[x].emoji} {ROLE_META[x].label}
                    </option>
                  ))}
                </select>
                <Button size="icon" variant="ghost" aria-label={`Quitar a @${r.profile.username} del equipo`} disabled={busy} onClick={() => apply(r.profile!.username, null)}>
                  <X />
                </Button>
              </>
            )}
          </li>
        ))}
        {!rows.length && <li className="px-4 py-6 text-center text-sm text-muted">Todavía no sumaste a nadie del equipo.</li>}
      </ul>
    </Panel>
  );
}
