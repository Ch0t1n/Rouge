"use client";

import * as C from "@/lib/store/commands";
import { useEffect, useRef, useState } from "react";
import { Dices, Gift, Plus, ScanLine, Trophy } from "lucide-react";
import type { PerkType, Raffle, RaffleFilter, UUID } from "@/lib/types";
import { createRaffle, drawRaffle, raffleEligible, redeemPerk, upsertPerkRule } from "@/lib/engine/actions";
import { activeEvent, getProfile } from "@/lib/engine/selectors";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatTime, timeAgo } from "@/lib/utils";
import { AdminHeader, Panel } from "@/components/admin/AdminChrome";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { faceOf, hasFeature } from "@/lib/engine/verticals";

const FILTERS: { id: RaffleFilter; label: string }[] = [
  { id: "active_pin", label: "Con pin activo en el plano ahora" },
  { id: "in_squad", label: "Que estén en un Squad / Equipo" },
  { id: "female", label: "Público femenino" },
  { id: "all", label: "Todos los asistentes" },
];
const PERK_TYPES: { id: PerkType; label: string }[] = [
  { id: "free_drink", label: "🍹 Trago gratis" },
  { id: "fast_pass", label: "⚡ Fila rápida" },
  { id: "raffle_prize", label: "🏆 Premio" },
];
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function AdminPerksPage() {
  const { state } = useRouge();
  const event = activeEvent(state)!;
  return (
    <main className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-6 px-5 py-6 lg:px-10 lg:py-10">
      <AdminHeader title="Perks, QR Drops y sorteos" subtitle="Recompensas automáticas para atraer grupos y público femenino, y sorteos en vivo." />
      <div className="grid gap-6 xl:grid-cols-2">
        <RafflePanel eventId={event.id} />
        <div className="space-y-6">
          <RulesPanel eventId={event.id} defaultBefore={event.starts_at} />
          <RedeemPanel />
        </div>
      </div>
    </main>
  );
}

// ── Reglas automáticas ──────────────────────────────────────────────
function RulesPanel({ eventId, defaultBefore }: { eventId: UUID; defaultBefore: string }) {
  const { state, exec, notify } = useRouge();
  const rules = state.perk_rules.filter((r) => r.event_id === eventId);
  const [title, setTitle] = useState("🍹 Trago de Bienvenida — Squad de 4+");
  const [type, setType] = useState<PerkType>("free_drink");
  const [min, setMin] = useState(4);
  const [before, setBefore] = useState(toLocal(new Date(+new Date(defaultBefore) + 90 * 60_000).toISOString()));
  const [useBefore, setUseBefore] = useState(true);

  const create = async () => {
    const r = await exec(C.upsertPerkRule({ event_id: eventId, title, perk_type: type, trigger: { kind: "squad_size", min_members: min, before: useBefore ? new Date(before).toISOString() : null }, is_active: true }));
    if (r.ok) notify({ tone: "vip", title: "Regla activada ✓", description: "Los Squads que ya cumplen reciben su QR al instante." });
  };

  return (
    <Panel title={<span className="flex items-center gap-2"><Gift className="size-5 text-vip" /> QR Drops automáticos</span>}>
      <ul className="space-y-2">
        {rules.map((r) => {
          const issued = state.user_perks_qrs.filter((p) => p.source_ref_id === r.id).length;
          return (
            <li key={r.id} className="rounded-2xl border border-white/10 px-4 py-1">
              <Switch
                tone="vip"
                id={`rule-${r.id}`}
                checked={r.is_active}
                onCheckedChange={(v) => exec(C.upsertPerkRule({ ...r, is_active: v }))}
                label={r.title}
                description={`Squad de ${r.trigger.min_members}+${r.trigger.before ? ` antes de las ${formatTime(r.trigger.before)}` : ""} · ${issued} QRs entregados`}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        <p className="font-display text-sm font-semibold">Nueva regla</p>
        <TextField label="Premio (lo que ve el usuario)" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {PERK_TYPES.map((p) => (
            <button key={p.id} type="button" onClick={() => setType(p.id)} className={cn("min-h-[40px] rounded-full px-3 text-sm font-semibold", type === p.id ? "bg-vip text-background" : "bg-white/[0.05] text-muted")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Cuando un Squad llegue a" type="number" min={2} value={min} onChange={(e) => setMin(Number(e.target.value))} hint="integrantes" />
          <div>
            <TextField label="Antes de" type="datetime-local" value={before} disabled={!useBefore} onChange={(e) => setBefore(e.target.value)} />
            <label className="mt-1 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={!useBefore} onChange={(e) => setUseBefore(!e.target.checked)} className="accent-vip" /> Sin horario límite
            </label>
          </div>
        </div>
        <Button variant="vip" onClick={create} disabled={!title.trim()}>
          <Plus /> Activar regla
        </Button>
      </div>
    </Panel>
  );
}

// ── Ruleta de sorteo en vivo ────────────────────────────────────────
function RafflePanel({ eventId }: { eventId: UUID }) {
  const { state, exec, notify } = useRouge();
  const [prize, setPrize] = useState("Botella de Champagne en el VIP");
  const [filter, setFilter] = useState<RaffleFilter>("active_pin");
  const [spinning, setSpinning] = useState<{ raffleId: UUID; pool: UUID[]; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raffles = state.raffles.filter((r) => r.event_id === eventId).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const pending = raffles.filter((r) => !r.winner_user_id);
  const done = raffles.filter((r) => r.winner_user_id);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const spin = async (raffle: Raffle) => {
    const pool = raffleEligible(state, eventId, raffle.filter);
    if (!pool.length) {
      notify({ tone: "error", title: "No hay participantes que cumplan el filtro." });
      return;
    }
    // 1) Primero se sortea (en Supabase decide el servidor con random()); 2) la ruleta anima HACIA ese ganador.
    setSpinning({ raffleId: raffle.id, pool, index: 0 });
    const localIdx = Math.floor(Math.random() * pool.length);
    const r = await exec(C.drawRaffle(raffle.id, () => (localIdx + 0.5) / pool.length));
    if (!r.ok || !r.data.raffle.winner_user_id) {
      setSpinning(null);
      return;
    }
    const winnerId = r.data.raffle.winner_user_id;
    const wheel = pool.includes(winnerId) ? pool : [...pool, winnerId];
    const winnerIdx = wheel.indexOf(winnerId);
    // ~26 pasos que desaceleran y terminan en el ganador
    const steps = 26 + ((winnerIdx - 26) % wheel.length + wheel.length) % wheel.length;
    let i = 0;
    const tick = () => {
      setSpinning({ raffleId: raffle.id, pool: wheel, index: i % wheel.length });
      if (i >= steps) {
        notify({ tone: "vip", title: `🏆 Ganó ${faceOf(state, winnerId)?.full_name ?? "un asistente"}`, description: "El QR del premio ya está en su billetera." });
        timer.current = setTimeout(() => setSpinning(null), 2500);
        return;
      }
      i++;
      timer.current = setTimeout(tick, 50 + Math.pow(i / steps, 3) * 380);
    };
    tick();
  };

  const current = spinning ? faceOf(state, spinning.pool[spinning.index]) : null;

  return (
    <Panel title={<span className="flex items-center gap-2"><Dices className="size-5 text-vip" /> Sorteo en vivo</span>}>
      <div className="relative grid min-h-[220px] place-items-center overflow-hidden rounded-3xl border border-vip/30 bg-gradient-to-b from-vip/15 to-transparent p-6 text-center">
        {spinning && current ? (
          <div className="flex flex-col items-center gap-3">
            <Avatar profile={current} size={120} ring="vip" />
            <p className="font-display text-3xl font-bold text-vip text-glow-vip">{current.full_name.split(" ")[0]}</p>
            <p className="text-xs text-muted">{spinning.pool.length} participantes</p>
          </div>
        ) : done[0] ? (
          <WinnerCard raffle={done[0]} />
        ) : (
          <p className="text-sm text-muted">Creá un sorteo y presioná “Sortear ganador”. Ideal para la pantalla gigante.</p>
        )}
      </div>

      {pending.map((r) => (
        <div key={r.id} className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 p-3">
          <Trophy className="size-5 shrink-0 text-vip" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{r.prize_title}</p>
            <p className="text-xs text-muted">{FILTERS.find((f) => f.id === r.filter)?.label} · {raffleEligible(state, eventId, r.filter).length} participan</p>
          </div>
          <Button variant="vip" disabled={!!spinning} onClick={() => spin(r)}>
            Sortear ganador
          </Button>
        </div>
      ))}

      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        <p className="font-display text-sm font-semibold">Nuevo sorteo</p>
        <TextField label="Premio" value={prize} maxLength={60} onChange={(e) => setPrize(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {FILTERS.filter((f) => f.id !== "female" || hasFeature(state, eventId, "genderRaffle")).map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={cn("min-h-[40px] rounded-full px-3 text-xs font-semibold", filter === f.id ? "bg-vip text-background" : "bg-white/[0.05] text-muted")}>
              {f.label} · {raffleEligible(state, eventId, f.id).length}
            </button>
          ))}
        </div>
        <Button variant="glass" onClick={() => exec(C.createRaffle(eventId, prize, filter))} disabled={!prize.trim()}>
          <Plus /> Crear sorteo
        </Button>
      </div>

      {done.length > 0 && (
        <ul className="mt-5 space-y-2 border-t border-white/10 pt-4">
          {done.map((r) => {
            const w = faceOf(state, r.winner_user_id);
            const perk = state.user_perks_qrs.find((p) => p.id === r.winner_perk_id);
            return (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                {w && <Avatar profile={w} size={32} ring="vip" />}
                <span className="min-w-0 flex-1 truncate">
                  <b>{w?.full_name}</b> ganó {r.prize_title}
                </span>
                <Badge tone={perk?.status === "redeemed" ? "neutral" : "vip"}>{perk?.status === "redeemed" ? "Canjeado" : "QR enviado"}</Badge>
                <span className="text-xs text-muted">{r.drawn_at ? timeAgo(r.drawn_at) : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function WinnerCard({ raffle }: { raffle: Raffle }) {
  const { state } = useRouge();
  const w = faceOf(state, raffle.winner_user_id);
  if (!w) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-bold uppercase tracking-widest text-vip">Último ganador</p>
      <Avatar profile={w} size={96} ring="vip" />
      <p className="font-display text-2xl font-bold">{w.full_name}</p>
      <p className="text-sm text-muted">🏆 {raffle.prize_title}</p>
    </div>
  );
}

// ── Canje de QR ─────────────────────────────────────────────────────
function RedeemPanel() {
  const { state, exec, notify } = useRouge();
  const [code, setCode] = useState("");
  return (
    <Panel title={<span className="flex items-center gap-2"><ScanLine className="size-5 text-squad" /> Validar QR de perk</span>}>
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await exec(C.redeemPerk(code.trim()));
          if (r.ok) {
            const owner = faceOf(state, r.data.user_id);
            notify({ tone: "squad", title: `✅ Canjeado: ${r.data.title}`, description: owner ? `De ${owner.full_name}` : undefined });
            setCode("");
          }
        }}
      >
        <div className="flex-1">
          <TextField label="Código del QR" placeholder="ROUGE:FREE_DRINK:…" value={code} onChange={(e) => setCode(e.target.value)} hint="Escaneá con el lector de la barra o tipealo." />
        </div>
        <Button type="submit" variant="squad" disabled={!code.trim()} className="mb-6">
          Canjear
        </Button>
      </form>
    </Panel>
  );
}
