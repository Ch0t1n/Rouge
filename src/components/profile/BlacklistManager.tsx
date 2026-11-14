"use client";

import * as C from "@/lib/store/commands";
import { useState } from "react";
import { BookUser, PhoneOff, Plus, UserX } from "lucide-react";
import { blockPhone, unblock } from "@/lib/engine/actions";
import { blockListOf } from "@/lib/engine/profile";
import { useRouge } from "@/lib/store/RougeContext";
import { normalizePhone, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PhoneField } from "./PhoneField";

interface ContactsManagerLike {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ tel?: string[]; name?: string[] }[]>;
}

/**
 * Lista negra preventiva: números de teléfono (y perfiles bloqueados).
 * Invisibilidad mutua garantizada por el motor; la UI nunca revela si el
 * número tiene cuenta en ROUGE.
 */
export function BlacklistManager({ compact = false }: { compact?: boolean }) {
  const { state, exec, notify } = useRouge();
  const me = state.current_user_id;
  const [phone, setPhone] = useState("");
  const list = blockListOf(state, me);
  const contacts = typeof navigator !== "undefined" ? (navigator as Navigator & { contacts?: ContactsManagerLike }).contacts : undefined;

  const add = async (raw: string, silent = false) => {
    const r = await exec(C.blockPhone(me, raw), { silent });
    return r.ok;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await add(phone)) {
      setPhone("");
      notify({ tone: "squad", title: "🔒 Número agregado a tu lista negra", description: "Si tiene cuenta, desde ahora son invisibles entre sí." });
    }
  };

  const pickContacts = async () => {
    if (!contacts) return;
    try {
      const picked = await contacts.select(["tel", "name"], { multiple: true });
      let n = 0;
      for (const t of picked.flatMap((c) => c.tel ?? [])) if (await add(t, true)) n++;
      notify({ tone: "squad", title: n ? `🔒 ${n} contacto(s) bloqueado(s)` : "No se agregaron números válidos" });
    } catch {
      /* cancelado */
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-3">
        <PhoneField label="Agregar número a la lista negra" value={phone} onChange={setPhone} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={!normalizePhone(phone)}>
            <Plus /> Bloquear número
          </Button>
          {contacts && (
            <Button type="button" variant="glass" onClick={pickContacts}>
              <BookUser /> Contactos
            </Button>
          )}
        </div>
      </form>

      <section aria-labelledby="bl-phones">
        <h3 id="bl-phones" className="mb-2 flex items-center gap-2 text-sm text-muted">
          <PhoneOff className="size-4" /> Números bloqueados · {list.phones.length}
        </h3>
        {list.phones.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">Tu lista está vacía.</p>
        ) : (
          <ul className="space-y-2">
            {list.phones.map((p) => (
              <li key={p.id} className="glass flex min-h-touch items-center gap-3 rounded-2xl py-2 pl-4 pr-2">
                <span className="flex-1 font-display text-sm font-semibold tabular-nums tracking-wide">{p.masked}</span>
                <span className="text-xs text-muted">{timeAgo(p.created_at)}</span>
                <Button size="sm" variant="ghost" onClick={() => exec(C.unblock(me, p.id))} aria-label={`Desbloquear ${p.masked}`}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!compact && (
        <section aria-labelledby="bl-users">
          <h3 id="bl-users" className="mb-2 flex items-center gap-2 text-sm text-muted">
            <UserX className="size-4" /> Perfiles bloqueados · {list.users.length}
          </h3>
          {list.users.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">
              Podés bloquear a alguien desde su perfil (menú ⋯).
            </p>
          ) : (
            <ul className="space-y-2">
              {list.users.map((u) => (
                <li key={u.id} className="glass flex min-h-touch items-center gap-3 rounded-2xl py-2 pl-2 pr-2">
                  <Avatar profile={u.profile} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{u.profile.full_name}</p>
                    <p className="truncate text-xs text-muted">@{u.profile.username} · {timeAgo(u.created_at)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      exec(C.unblock(me, u.id));
                      notify({ tone: "info", title: `Desbloqueaste a @${u.profile.username}`, description: "Vuelven a poder verse en los eventos que compartan." });
                    }}
                  >
                    Desbloquear
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
