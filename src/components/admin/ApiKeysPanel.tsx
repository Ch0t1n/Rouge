"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import type { RougeEvent } from "@/lib/types";
import * as C from "@/lib/store/commands";
import { useRouge } from "@/lib/store/RougeContext";
import { formatDateTime } from "@/lib/utils";
import { Panel } from "@/components/admin/AdminChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

const select = "min-h-touch rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-vip/50";

/**
 * Claves de la API v1 para ticketeras y productoras: generan los códigos de 1 uso y los mandan
 * con cada entrada (ver docs/api). La clave completa se muestra UNA sola vez.
 */
export function ApiKeysPanel({ event }: { event: RougeEvent }) {
  const { state, exec, notify, mode } = useRouge();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"event" | "all">("event");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const keys = state.api_keys.filter((k) => k.created_by === state.current_user_id && (k.event_id === null || k.event_id === event.id));

  const copy = async (text: string, what: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await exec(C.createApiKey(name, scope === "event" ? event.id : null));
    setBusy(false);
    if (r.ok) {
      setSecret(r.data.secret);
      setName("");
    }
  };

  const curl = `curl -X POST ${origin}/api/v1/events/${event.slug}/codes \\
  -H "Authorization: Bearer ${secret ?? "<tu clave>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"tickets":[{"external_ref":"ORD-1029-1","label":"General"}]}'`;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="size-5 text-vip" /> API para ticketeras
        </span>
      }
      className="xl:col-span-3"
    >
      <p className="max-w-3xl text-sm text-muted">
        Tu ticketera genera un código de ROUGE por cada entrada que vende y lo manda en el mail de la entrada (link + QR). Si la entrada se reembolsa, el código se anula. Documentación:{" "}
        <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="font-semibold text-vip underline">
          especificación OpenAPI
        </a>
        .
      </p>
      {mode === "demo" && <p className="mt-2 text-xs text-muted">Modo Demo: las claves son de ejemplo. La API funciona con Supabase.</p>}

      {secret && (
        <div className="mt-4 space-y-3 rounded-2xl border border-vip/50 bg-vip/10 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-vip">
            <ShieldAlert className="size-4" /> Guardá esta clave ahora: no la vamos a volver a mostrar.
          </p>
          <div className="flex gap-2">
            <code className="flex min-h-touch flex-1 items-center overflow-x-auto whitespace-nowrap rounded-xl bg-background/60 px-3 font-mono text-xs">{secret}</code>
            <Button size="icon" variant="glass" aria-label="Copiar clave" onClick={() => copy(secret, "key")}>
              {copied === "key" ? <Check className="text-squad" /> : <Copy />}
            </Button>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>Ejemplo: un código por entrada</span>
              <button type="button" onClick={() => copy(curl, "curl")} className="font-semibold text-vip">
                {copied === "curl" ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-primary/90">{curl}</pre>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>
            Ya la guardé
          </Button>
        </div>
      )}

      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <TextField label="Nombre de la clave" placeholder="Ticketera / Sistema de entradas" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Alcance</span>
          <select aria-label="Alcance de la clave" value={scope} onChange={(e) => setScope(e.target.value as "event" | "all")} className={select}>
            <option value="event" className="bg-surface">Solo este evento</option>
            <option value="all" className="bg-surface">Todos mis eventos</option>
          </select>
        </label>
        <Button type="submit" variant="vip" disabled={busy || !name.trim()}>
          <KeyRound /> Crear clave
        </Button>
      </form>

      <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/5">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{k.name}</p>
              <p className="truncate font-mono text-xs text-muted">{k.prefix}_••••</p>
            </div>
            <Badge tone={k.event_id ? "neutral" : "vip"}>{k.event_id ? "Este evento" : "Todos mis eventos"}</Badge>
            <span className="text-xs text-muted">{k.last_used_at ? `Usada ${formatDateTime(k.last_used_at)}` : "Sin usar"}</span>
            {k.revoked_at ? (
              <Badge>Revocada</Badge>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Revocar la clave ${k.name}`}
                onClick={async () => {
                  const r = await exec(C.revokeApiKey(k.id));
                  if (r.ok) notify({ tone: "info", title: `Clave "${k.name}" revocada`, description: "Las llamadas con esa clave dejan de funcionar al instante." });
                }}
              >
                <Trash2 /> Revocar
              </Button>
            )}
          </li>
        ))}
        {!keys.length && <li className="px-4 py-6 text-center text-sm text-muted">Todavía no creaste claves.</li>}
      </ul>
    </Panel>
  );
}
