"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { Plus, Trash2, UsersRound, X } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import { MAX_SQUAD_SIZE } from "@/lib/engine/actions";
import { squadMembers, squadOf } from "@/lib/engine/selectors";
import { faceOf, verticalOf } from "@/lib/engine/verticals";
import { useRouge } from "@/lib/store/RougeContext";
import { Panel } from "@/components/admin/AdminChrome";
import { ShareButton } from "@/components/share/ShareSheet";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/**
 * Equipos que arma la organización (eventos corporativos, donde los asistentes no crean equipos): crear, sumar o mover
 * personas, quitar, borrar y compartir el link de cada equipo (QR). Cada equipo tiene su chat y su punto de encuentro.
 */
export function OrganizerTeamsPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify } = useRouge();
  const v = verticalOf(state, event.id);
  const [name, setName] = useState("");
  const teams = state.squads.filter((s) => s.event_id === event.id).sort((a, b) => a.name.localeCompare(b.name));
  const attendees = state.event_attendees
    .filter((a) => a.event_id === event.id)
    .map((a) => ({ id: a.user_id, name: faceOf(state, a.user_id, event.id)?.full_name ?? "—", team: squadOf(state, event.id, a.user_id)?.squad ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const create = async () => {
    const r = await exec(C.organizerCreateTeam(event.id, name));
    if (!r.ok) return;
    setName("");
    notify({ tone: "squad", title: `${v.copy.squad} "${r.data.name}" creado`, description: "Sumá personas o compartí su link." });
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <UsersRound className="size-5 text-squad" /> {v.copy.squad}s del evento
        </span>
      }
    >
      <p className="mb-4 text-sm text-muted">
        En este evento los {v.copy.squad.toLowerCase()}s los arma la organización: cada uno tiene su chat y su punto de encuentro en el plano. Sumá personas desde acá o compartí el link de cada {v.copy.squad.toLowerCase()} (hasta {MAX_SQUAD_SIZE} por {v.copy.squad.toLowerCase()}).
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <div className="min-w-[220px] flex-1">
          <TextField label={`Nuevo ${v.copy.squad.toLowerCase()}`} value={name} maxLength={32} placeholder="Mesa 3 · Ronda de negocios" onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" variant="squad" disabled={!name.trim()} data-testid="create-team">
          <Plus /> Crear
        </Button>
      </form>

      {teams.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Todavía no hay {v.copy.squad.toLowerCase()}s.</p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2" data-testid="organizer-teams">
          {teams.map((t) => {
            const members = squadMembers(state, t.id);
            const candidates = attendees.filter((a) => a.team?.id !== t.id);
            return (
              <li key={t.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.name}</p>
                    <p className="text-xs text-muted">
                      {members.length}/{MAX_SQUAD_SIZE} · <code className="font-display">{t.invite_code}</code>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <ShareButton
                      size="sm"
                      iconOnly
                      label="Link del equipo"
                      target={{ url: `/join/${t.invite_code}`, title: t.name, text: `Sumate al ${v.copy.squad.toLowerCase()} "${t.name}" de ${event.name}`, fileName: `equipo-${t.invite_code}`, accent: "squad", caption: t.invite_code }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Borrar ${t.name}`}
                      onClick={async () => {
                        if (!window.confirm(`¿Borrar "${t.name}"? Sus integrantes quedan sin ${v.copy.squad.toLowerCase()} y se borra su chat.`)) return;
                        const r = await exec(C.organizerDeleteTeam(event.id, t.id));
                        if (r.ok) notify({ tone: "info", title: `"${t.name}" borrado` });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const p = faceOf(state, m.user_id, event.id);
                    if (!p) return null;
                    return (
                      <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-squad/30 bg-squad/10 py-1 pl-1 pr-1 text-xs">
                        <Avatar profile={p} size={22} />
                        <span className="max-w-[140px] truncate">{p.full_name}</span>
                        <button
                          type="button"
                          aria-label={`Quitar a ${p.full_name} de ${t.name}`}
                          className="grid size-6 place-items-center rounded-full text-muted hover:bg-white/10 hover:text-primary"
                          onClick={() => void exec(C.organizerSetTeamMember(event.id, t.id, m.user_id, false))}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}
                  {members.length === 0 && <li className="text-xs text-muted">Sin integrantes todavía.</li>}
                </ul>
                <label className="mt-3 block">
                  <span className="sr-only">Sumar a {t.name}</span>
                  <select
                    value=""
                    disabled={members.length >= MAX_SQUAD_SIZE}
                    onChange={async (e) => {
                      const userId = e.target.value;
                      if (!userId) return;
                      const who = attendees.find((a) => a.id === userId);
                      const r = await exec(C.organizerSetTeamMember(event.id, t.id, userId, true));
                      if (r.ok) notify({ tone: "squad", title: `${who?.name.split(" ")[0] ?? "Listo"} ${r.data.moved ? "pasó" : "se sumó"} a ${t.name}` });
                    }}
                    className="min-h-[44px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm disabled:opacity-50"
                    data-testid={`add-to-${t.invite_code}`}
                  >
                    <option value="">+ Sumar persona…</option>
                    {candidates.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.team ? ` (en ${a.team.name})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
