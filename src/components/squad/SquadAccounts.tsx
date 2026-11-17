"use client";

// Movido desde src/app/squad/cuentas/page.tsx para reutilizarlo en la vista de escritorio de /squad.

import * as C from "@/lib/store/commands";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Copy, Plus, Receipt, Trash2, Wallet, X } from "lucide-react";
import type { SettlementMethod, UUID } from "@/lib/types";
import { activeEvent, getProfile, squadMembers, squadOf } from "@/lib/engine/selectors";
import { EXPENSE_DESCRIPTION_MAX, aliasOf, parsePayoutAlias, squadAccount, type Transfer } from "@/lib/engine/settle";
import { useRouge } from "@/lib/store/RougeContext";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

/** Pesos con centavos solo si hacen falta (una división puede dejar centavos). */
const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);

const METHODS: { id: SettlementMethod; label: string; emoji: string }[] = [
  { id: "mercadopago", label: "Mercado Pago", emoji: "💙" },
  { id: "transfer", label: "Transferencia", emoji: "🏦" },
  { id: "cash", label: "Efectivo", emoji: "💵" },
];

/**
 * Cuentas de la mesa del Squad. `embedded`: dentro de la columna derecha de /squad en PC (sin cabecera ni
 * cambio de evento por URL).
 */
export function SquadAccounts({ embedded = false }: { embedded?: boolean }) {
  const { state, exec, notify, setActiveEvent } = useRouge();
  const params = useSearchParams();
  // Link desde una notificación de otra noche: /squad/cuentas?evento=<id> (las cuentas se saldan al día siguiente).
  const wanted = embedded ? null : params.get("evento");
  useEffect(() => {
    if (wanted && wanted !== state.active_event_id && state.events.some((e) => e.id === wanted)) setActiveEvent(wanted);
  }, [wanted, state.active_event_id, state.events, setActiveEvent]);

  const event = activeEvent(state);
  const meId = state.current_user_id;
  const mine = event ? squadOf(state, event.id, meId) : undefined;
  const acc = useMemo(() => (mine ? squadAccount(state, mine.squad.id, meId) : null), [state, mine, meId]);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Transfer | null>(null);

  if (!event || !mine || !acc) {
    return (
      <main>
        {!embedded && <PageHeader title="Cuentas de la mesa" backHref="/squad" />}
        <div className="mx-4 mt-10 rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">
          <p>Las cuentas son del Squad: armá o sumate a uno para dividir lo que comparten.</p>
          <Link href="/squad" className={cn(buttonVariants({ variant: "squad" }), "mt-4")}>
            Ir a Squad
          </Link>
        </div>
      </main>
    );
  }

  const squadId = mine.squad.id;
  const name = (id: UUID) => (id === meId ? "Vos" : (getProfile(state, id)?.full_name.split(" ")[0] ?? "Alguien"));
  const net = acc.mine.net;

  return (
    <main className={embedded ? "pb-6" : "pb-16"}>
      {!embedded && <PageHeader title="Cuentas de la mesa" subtitle={mine.squad.name} backHref="/squad" />}
      <div className={cn("space-y-5", embedded ? "px-1" : "px-4")}>
        {/* Resumen */}
        <section
          className={cn(
            "rounded-3xl border p-5",
            acc.iOwe.length ? "border-rouge/40 bg-rouge/[0.07]" : acc.owedToMe.length ? "border-squad/40 bg-squad/[0.07]" : "border-white/10 bg-white/[0.03]",
          )}
          data-testid="settle-summary"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tu saldo</p>
          <p className={cn("metric mt-1 text-4xl", net < 0 ? "text-rouge" : net > 0 ? "text-squad" : "text-primary")}>{net === 0 ? "A mano 🙌" : money(Math.abs(net))}</p>
          <p className="mt-1 text-sm text-muted">
            {net < 0 ? "Te toca transferir." : net > 0 ? "Te lo tienen que devolver." : "No le debés nada a nadie."} Pusiste {money(acc.mine.paid)} · tu parte {money(acc.mine.owed)} · la mesa gastó {money(acc.total)}.
          </p>
        </section>

        {/* Transferencias pendientes de confirmar (me dicen que me pagaron) */}
        {acc.pendingConfirm.map((t) => (
          <section key={t.id} className="flex items-center gap-3 rounded-2xl border border-squad/40 bg-squad/[0.06] p-3" role="status">
            <Wallet className="size-5 shrink-0 text-squad" />
            <p className="min-w-0 flex-1 text-sm">
              <b>{name(t.from_user)}</b> dice que te pasó <b>{money(t.amount)}</b> por {METHODS.find((m) => m.id === t.method)?.label.toLowerCase()}.
            </p>
            <Button size="sm" variant="squad" onClick={() => exec(C.respondSettlement(t.id, meId, true))}>
              <Check /> Recibido
            </Button>
            <Button size="icon" variant="ghost" aria-label="No me llegó" onClick={() => exec(C.respondSettlement(t.id, meId, false))}>
              <X />
            </Button>
          </section>
        ))}

        {/* Transferencias sugeridas */}
        <section aria-labelledby="transfers">
          <h2 id="transfers" className="mb-2 text-lg">Para quedar a mano</h2>
          {acc.transfers.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">Nadie le debe nada a nadie. 🙌</p>
          ) : (
            <ul className="space-y-2">
              {acc.transfers.map((t) => {
                const from = getProfile(state, t.from);
                const to = getProfile(state, t.to);
                const alias = aliasOf(state, t.to);
                const minePay = t.from === meId;
                return (
                  <li key={`${t.from}-${t.to}`} className={cn("rounded-2xl border p-3", minePay ? "border-rouge/40 bg-rouge/[0.05]" : "border-white/10 bg-white/[0.03]")} data-testid="settle-transfer">
                    <div className="flex items-center gap-2">
                      {from && <Avatar profile={from} size={32} />}
                      <ArrowRight className="size-4 shrink-0 text-muted" />
                      {to && <Avatar profile={to} size={32} />}
                      <p className="min-w-0 flex-1 truncate text-sm">
                        <b>{name(t.from)}</b> → <b>{name(t.to)}</b>
                      </p>
                      <span className="metric text-lg">{money(t.amount)}</span>
                    </div>
                    {(minePay || t.to === meId) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {minePay && alias && (
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard?.writeText(alias).catch(() => undefined);
                              notify({ tone: "squad", title: "Alias copiado", description: `${alias} · pegalo en Mercado Pago o tu banco.` });
                            }}
                            className="glass-pill inline-flex min-h-[36px] items-center gap-1.5 hover:bg-white/10"
                          >
                            <Copy className="size-3.5" /> {alias}
                          </button>
                        )}
                        {minePay && !alias && <span className="text-xs text-muted">{name(t.to)} todavía no cargó su alias.</span>}
                        {minePay && (
                          <Button size="sm" variant="rouge" className="ml-auto" onClick={() => setPaying(t)}>
                            Ya le pagué
                          </Button>
                        )}
                        {t.to === meId && <span className="text-xs text-muted">Te avisamos cuando {name(t.from)} marque que te pagó.</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Quién pagó qué */}
        <section aria-labelledby="ledger">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="ledger" className="text-lg">Quién pagó qué</h2>
            <Button size="sm" variant="vip" onClick={() => setAdding(true)}>
              <Plus /> Agregar gasto
            </Button>
          </div>
          {acc.ledger.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-muted">
              Todavía no hay nada para dividir. Lo que pidan compartido en la Barra Express se suma solo; la mesa, las entradas o el taxi, cargalos acá.
            </p>
          ) : (
            <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {acc.ledger.map((e) => {
                const payer = getProfile(state, e.payer);
                return (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    {payer && <Avatar profile={payer} size={36} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {e.kind === "order" ? "🍸 " : e.kind === "settlement" ? "💸 " : ""}
                        {e.kind === "settlement" ? `${name(e.payer)} le pasó a ${name(e.participants[0])}` : e.title}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {e.kind === "settlement"
                          ? e.confirmed
                            ? "Confirmada ✓"
                            : "Falta que la confirme"
                          : `Pagó ${name(e.payer)} · entre ${e.participants.length} · ${formatDateTime(e.created_at)}`}
                      </p>
                    </div>
                    <span className={cn("metric shrink-0", e.kind === "settlement" ? "text-squad" : "text-primary")}>{money(e.amount)}</span>
                    {e.kind === "expense" && e.payer === meId && (
                      <Button size="icon" variant="ghost" aria-label={`Borrar ${e.title}`} onClick={() => exec(C.deleteSquadExpense(e.id, meId))}>
                        <Trash2 />
                      </Button>
                    )}
                    {e.kind === "settlement" && !e.confirmed && e.payer === meId && (
                      <Button size="icon" variant="ghost" aria-label="Anular transferencia" onClick={() => {
                        const t = state.squad_settlements.find((x) => x.id === e.id);
                        if (t) void exec(C.respondSettlement(t.id, meId, false));
                      }}>
                        <X />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Saldos */}
        <section aria-labelledby="balances">
          <h2 id="balances" className="mb-2 text-lg">Saldos</h2>
          <ul className="grid grid-cols-2 gap-2">
            {acc.balances.map((b) => {
              const p = getProfile(state, b.user_id);
              return (
                <li key={b.user_id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  {p && <Avatar profile={p} size={32} />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{name(b.user_id)}</p>
                    <p className={cn("metric text-sm", b.net < 0 ? "text-rouge" : b.net > 0 ? "text-squad" : "text-muted")}>
                      {b.net === 0 ? "a mano" : `${b.net > 0 ? "+" : "−"}${money(Math.abs(b.net))}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <AliasField />
      </div>

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} squadId={squadId} />
      <PaySheet transfer={paying} onClose={() => setPaying(null)} squadId={squadId} />
    </main>
  );
}

function AddExpenseSheet({ open, onClose, squadId }: { open: boolean; onClose: () => void; squadId: UUID }) {
  const { state, exec, notify } = useRouge();
  const meId = state.current_user_id;
  const members = squadMembers(state, squadId);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [who, setWho] = useState<UUID[]>(() => members.map((m) => m.user_id));
  const value = Number(amount.replace(/\./g, "").replace(",", "."));

  const save = async () => {
    const r = await exec(C.addSquadExpense(squadId, meId, { description, amount: value, participantIds: who }));
    if (!r.ok) return;
    notify({ tone: "vip", title: "Gasto agregado", description: `${money(value)} entre ${who.length}.` });
    setDescription("");
    setAmount("");
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Agregar gasto"
      description="Lo pagaste vos y lo comparten: la mesa, las entradas, el taxi…"
      footer={
        <Button block size="lg" variant="vip" onClick={save} disabled={!description.trim() || !(value > 0) || !who.length}>
          <Receipt /> Agregar {value > 0 ? money(value) : ""}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField label="¿En qué fue?" value={description} maxLength={EXPENSE_DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Reserva de la mesa" />
        <TextField label="Monto" inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">¿Entre quiénes?</legend>
          <ul className="flex flex-wrap gap-2">
            {members.map((m) => {
              const p = getProfile(state, m.user_id);
              const on = who.includes(m.user_id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWho((w) => (on ? w.filter((x) => x !== m.user_id) : [...w, m.user_id]))}
                    className={cn("flex min-h-[44px] items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition", on ? "border-vip bg-vip/15" : "border-white/10 bg-white/[0.03] text-muted")}
                  >
                    {p && <Avatar profile={p} size={32} />}
                    {m.user_id === meId ? "Yo" : p?.full_name.split(" ")[0]}
                  </button>
                </li>
              );
            })}
          </ul>
          {value > 0 && who.length > 0 && <p className="mt-2 text-xs text-muted">{money(Math.round((value / who.length) * 100) / 100)} c/u</p>}
        </fieldset>
      </div>
    </BottomSheet>
  );
}

function PaySheet({ transfer, onClose, squadId }: { transfer: Transfer | null; onClose: () => void; squadId: UUID }) {
  const { state, exec, notify } = useRouge();
  const [method, setMethod] = useState<SettlementMethod>("mercadopago");
  const [amount, setAmount] = useState("");
  useEffect(() => setAmount(transfer ? String(transfer.amount) : ""), [transfer]);
  if (!transfer) return null;
  const to = getProfile(state, transfer.to);
  const value = Number(amount.replace(",", "."));

  const save = async () => {
    const r = await exec(C.recordSettlement(squadId, state.current_user_id, transfer.to, value, method));
    if (!r.ok) return;
    notify({ tone: "squad", title: "Listo, le avisamos", description: `${to?.full_name.split(" ")[0] ?? "Tu amiga/o"} tiene que confirmar que le llegó.` });
    onClose();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`¿Le pagaste a ${to?.full_name.split(" ")[0] ?? ""}?`}
      description="Registralo cuando hayas transferido: se descuenta de la cuenta cuando lo confirme."
      footer={
        <Button block size="lg" variant="squad" onClick={save} disabled={!(value > 0)}>
          <Check /> Ya le pagué {value > 0 ? money(value) : ""}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField label="Monto" inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cómo le pagaste">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              onClick={() => setMethod(m.id)}
              className={cn("min-h-[64px] rounded-2xl border p-2 text-center text-xs font-semibold transition", method === m.id ? "border-squad bg-squad/10" : "border-white/10 bg-white/[0.03] text-muted")}
            >
              <span className="block text-xl">{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

/** Mi alias o CBU/CVU: solo lo ven quienes comparten un Squad conmigo. */
function AliasField() {
  const { state, exec, notify } = useRouge();
  const current = aliasOf(state, state.current_user_id) ?? "";
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const invalid = value.trim() !== "" && !parsePayoutAlias(value);
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="alias">
      <h2 id="alias" className="text-base">Tu alias para cobrar</h2>
      <p className="mt-1 text-xs text-muted">Así te transfieren sin preguntarte. Lo ven solo quienes están en un Squad con vos.</p>
      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TextField label="Alias o CBU/CVU" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ej: sofi.noche.mp" error={invalid ? "Usá tu alias (6 a 20 letras, números o puntos) o un CBU/CVU de 22 dígitos." : null} />
        </div>
        <Button
          className="mt-7"
          variant="glass"
          disabled={invalid || value.trim() === current}
          onClick={async () => {
            const r = await exec(C.setPayoutAlias(state.current_user_id, value));
            if (r.ok) notify({ tone: "squad", title: r.data ? "Alias guardado" : "Alias borrado" });
          }}
        >
          Guardar
        </Button>
      </div>
    </section>
  );
}
