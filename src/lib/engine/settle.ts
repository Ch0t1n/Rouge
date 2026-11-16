/**
 * Cuentas de la mesa — reglas PURAS ("quién pagó qué" y las transferencias para quedar a mano).
 *
 * Entra en la cuenta de un Squad:
 *   - los pedidos compartidos de la Barra Express (split_user_ids: Vaquita o botella para la mesa) ya pagos
 *     o a pagar en la barra: los pagó quien pidió y los consumen los elegidos;
 *   - los gastos cargados a mano (mesa, entradas, taxi…): los pagó quien los carga, partes iguales;
 *   - las transferencias ya hechas entre integrantes ("Ya te pagué").
 *
 * Todo se calcula en centavos enteros (sin errores de coma flotante). El resto de una división se reparte
 * de a 1 centavo en el orden de la lista. Las transferencias sugeridas son las mínimas: cada deudor le paga
 * al acreedor con más saldo (a lo sumo n − 1 transferencias).
 *
 * Funciona también después del cierre del lobby: las cuentas se saldan al día siguiente.
 * Contraparte SQL: squad_expenses, squad_settlements y las RPC add_squad_expense / record_settlement.
 */
import type { PayoutAlias, RougeState, SettlementMethod, SquadExpense, SquadSettlement, UUID } from "@/lib/types";
import { uid } from "@/lib/utils";

type R<T> = { ok: true; state: RougeState; data: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const EXPENSE_DESCRIPTION_MAX = 60;
export const MAX_EXPENSE = 50_000_000;

export const toCents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => c / 100;

/** Reparte `cents` entre `ids` en partes iguales (el resto, de a 1 centavo en orden). */
export function splitCents(cents: number, ids: UUID[]): Map<UUID, number> {
  const out = new Map<UUID, number>();
  if (!ids.length) return out;
  const base = Math.floor(cents / ids.length);
  let rest = cents - base * ids.length;
  for (const id of ids) {
    out.set(id, (out.get(id) ?? 0) + base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
  return out;
}

export type LedgerKind = "order" | "expense" | "settlement";

export interface LedgerEntry {
  id: UUID;
  kind: LedgerKind;
  title: string;
  payer: UUID;
  /** En pesos. */
  amount: number;
  /** Quiénes lo consumen (en una transferencia: quien la recibe). */
  participants: UUID[];
  created_at: string;
  /** Transferencias: si quien recibe ya la confirmó. */
  confirmed?: boolean;
}

export const squadMemberIds = (s: RougeState, squadId: UUID) => s.squad_members.filter((m) => m.squad_id === squadId && m.status === "joined").map((m) => m.user_id);

/** Todo lo que entra en la cuenta del Squad, del más nuevo al más viejo. */
export function squadLedger(s: RougeState, squadId: UUID): LedgerEntry[] {
  const orders: LedgerEntry[] = s.bar_orders
    .filter((o) => o.squad_id === squadId && o.split_user_ids.length > 0 && o.payment_status !== "awaiting_payment")
    .map((o) => ({
      id: o.id,
      kind: "order",
      title: o.items_json.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}`).join(", "),
      payer: o.user_id,
      amount: o.total_amount,
      participants: o.split_user_ids,
      created_at: o.created_at,
    }));
  const expenses: LedgerEntry[] = s.squad_expenses
    .filter((e) => e.squad_id === squadId)
    .map((e) => ({ id: e.id, kind: "expense", title: e.description, payer: e.paid_by, amount: e.amount, participants: e.participant_ids, created_at: e.created_at }));
  const settlements: LedgerEntry[] = s.squad_settlements
    .filter((t) => t.squad_id === squadId)
    .map((t) => ({ id: t.id, kind: "settlement", title: "Transferencia", payer: t.from_user, amount: t.amount, participants: [t.to_user], created_at: t.created_at, confirmed: !!t.confirmed_at }));
  return [...orders, ...expenses, ...settlements].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export interface Balance {
  user_id: UUID;
  /** Lo que puso (pedidos, gastos y transferencias enviadas). */
  paid: number;
  /** Lo que le corresponde (su parte de lo compartido y transferencias recibidas). */
  owed: number;
  /** paid − owed: > 0 le tienen que devolver · < 0 tiene que poner. */
  net: number;
}

/** Saldo de cada integrante (incluye a quien ya no está en el Squad si figura en algún gasto). */
export function squadBalances(s: RougeState, squadId: UUID): Balance[] {
  const paid = new Map<UUID, number>();
  const owed = new Map<UUID, number>();
  const add = (m: Map<UUID, number>, id: UUID, c: number) => m.set(id, (m.get(id) ?? 0) + c);
  for (const id of squadMemberIds(s, squadId)) add(paid, id, 0);
  for (const e of squadLedger(s, squadId)) {
    const cents = toCents(e.amount);
    add(paid, e.payer, cents);
    for (const [id, c] of splitCents(cents, e.participants)) add(owed, id, c);
  }
  const ids = new Set([...paid.keys(), ...owed.keys()]);
  return [...ids].map((id) => {
    const p = paid.get(id) ?? 0;
    const o = owed.get(id) ?? 0;
    return { user_id: id, paid: fromCents(p), owed: fromCents(o), net: fromCents(p - o) };
  });
}

export interface Transfer {
  from: UUID;
  to: UUID;
  amount: number;
}

/** Transferencias mínimas para dejar todos los saldos en cero (greedy: mayor deudor → mayor acreedor). */
export function settleTransfers(balances: Pick<Balance, "user_id" | "net">[]): Transfer[] {
  const debtors = balances.map((b) => ({ id: b.user_id, c: -toCents(b.net) })).filter((d) => d.c > 0);
  const creditors = balances.map((b) => ({ id: b.user_id, c: toCents(b.net) })).filter((d) => d.c > 0);
  const out: Transfer[] = [];
  const byAmount = (a: { id: UUID; c: number }, b: { id: UUID; c: number }) => b.c - a.c || a.id.localeCompare(b.id);
  while (debtors.length && creditors.length) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.c, c.c);
    out.push({ from: d.id, to: c.id, amount: fromCents(amt) });
    d.c -= amt;
    c.c -= amt;
    if (!d.c) debtors.shift();
    if (!c.c) creditors.shift();
  }
  return out;
}

/** Resumen listo para la pantalla: saldos, transferencias pendientes y lo que me toca a mí. */
export function squadAccount(s: RougeState, squadId: UUID, me: UUID = s.current_user_id) {
  const balances = squadBalances(s, squadId);
  const transfers = settleTransfers(balances);
  const ledger = squadLedger(s, squadId);
  const total = fromCents(ledger.filter((e) => e.kind !== "settlement").reduce((a, e) => a + toCents(e.amount), 0));
  return {
    ledger,
    balances,
    transfers,
    total,
    mine: balances.find((b) => b.user_id === me) ?? { user_id: me, paid: 0, owed: 0, net: 0 },
    iOwe: transfers.filter((t) => t.from === me),
    owedToMe: transfers.filter((t) => t.to === me),
    pendingConfirm: s.squad_settlements.filter((t) => t.squad_id === squadId && t.to_user === me && !t.confirmed_at),
    settled: transfers.length === 0,
  };
}

// ── Acciones ──────────────────────────────────────────────────────────

const squadEvent = (s: RougeState, squadId: UUID) => s.squads.find((q) => q.id === squadId)?.event_id;

export interface ExpenseInput {
  description: string;
  amount: number;
  participantIds: UUID[];
}

/** Carga un gasto pagado por mí y compartido entre integrantes. Espejo de add_squad_expense. */
export function addSquadExpense(state: RougeState, squadId: UUID, userId: UUID, input: ExpenseInput, now = Date.now()): R<SquadExpense> {
  const eventId = squadEvent(state, squadId);
  const members = squadMemberIds(state, squadId);
  if (!eventId || !members.includes(userId)) return fail("No sos parte de este Squad.");
  const description = input.description.trim();
  if (!description || description.length > EXPENSE_DESCRIPTION_MAX) return fail(`Contá en qué fue el gasto (máximo ${EXPENSE_DESCRIPTION_MAX} caracteres).`);
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_EXPENSE) return fail("Ingresá un monto válido.");
  const participants = [...new Set(input.participantIds)];
  if (!participants.length) return fail("Elegí entre quiénes se divide.");
  if (participants.some((p) => !members.includes(p))) return fail("Solo se divide entre integrantes del Squad.");
  const expense: SquadExpense = { id: uid(), squad_id: squadId, event_id: eventId, paid_by: userId, description, amount, participant_ids: participants, created_at: new Date(now).toISOString() };
  return { ok: true, state: { ...state, squad_expenses: [...state.squad_expenses, expense] }, data: expense };
}

/** Quien cargó un gasto lo puede borrar (se equivocó de monto, lo cargó dos veces…). */
export function deleteSquadExpense(state: RougeState, expenseId: UUID, userId: UUID): R<undefined> {
  const e = state.squad_expenses.find((x) => x.id === expenseId);
  if (!e || e.paid_by !== userId) return fail("Solo quien cargó el gasto lo puede borrar.");
  return { ok: true, state: { ...state, squad_expenses: state.squad_expenses.filter((x) => x.id !== expenseId) }, data: undefined };
}

/** "Ya te pagué": registra una transferencia mía a otro integrante. Espejo de record_settlement. */
export function recordSettlement(state: RougeState, squadId: UUID, fromUser: UUID, toUser: UUID, amount: number, method: SettlementMethod, now = Date.now()): R<SquadSettlement> {
  const eventId = squadEvent(state, squadId);
  const members = squadMemberIds(state, squadId);
  if (!eventId || !members.includes(fromUser) || !members.includes(toUser)) return fail("No sos parte de este Squad.");
  if (fromUser === toUser) return fail("No te podés transferir a vos.");
  const value = Math.round(amount * 100) / 100;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_EXPENSE) return fail("Ingresá un monto válido.");
  const t: SquadSettlement = { id: uid(), squad_id: squadId, event_id: eventId, from_user: fromUser, to_user: toUser, amount: value, method, confirmed_at: null, created_at: new Date(now).toISOString() };
  return { ok: true, state: { ...state, squad_settlements: [...state.squad_settlements, t] }, data: t };
}

/** Quien recibe confirma ("Recibido") o la rechaza ("No me llegó": se borra y vuelve a la cuenta). */
export function respondSettlement(state: RougeState, settlementId: UUID, userId: UUID, received: boolean, now = Date.now()): R<SquadSettlement | null> {
  const t = state.squad_settlements.find((x) => x.id === settlementId);
  if (!t || (t.to_user !== userId && !(t.from_user === userId && !received))) return fail("No podés modificar esta transferencia.");
  if (t.confirmed_at) return fail("Esa transferencia ya está confirmada.");
  if (!received) return { ok: true, state: { ...state, squad_settlements: state.squad_settlements.filter((x) => x.id !== settlementId) }, data: null };
  const done = { ...t, confirmed_at: new Date(now).toISOString() };
  return { ok: true, state: { ...state, squad_settlements: state.squad_settlements.map((x) => (x.id === settlementId ? done : x)) }, data: done };
}

// ── Alias para cobrar ─────────────────────────────────────────────────

/**
 * Alias de Mercado Pago / banco (6 a 20 letras, números, puntos o guiones) o CBU/CVU de 22 dígitos.
 * Devuelve el valor normalizado o null si no es válido.
 */
export function parsePayoutAlias(raw: string): string | null {
  const v = raw.trim();
  const digits = v.replace(/[\s-]/g, "");
  if (/^\d{22}$/.test(digits)) return digits;
  if (/^[a-zA-Z0-9.-]{6,20}$/.test(v) && /[a-zA-Z]/.test(v)) return v.toLowerCase();
  return null;
}

export function setPayoutAlias(state: RougeState, userId: UUID, raw: string): R<PayoutAlias | null> {
  if (!raw.trim()) return { ok: true, state: { ...state, payout_aliases: state.payout_aliases.filter((a) => a.user_id !== userId) }, data: null };
  const alias = parsePayoutAlias(raw);
  if (!alias) return fail("Usá tu alias (6 a 20 letras, números o puntos) o un CBU/CVU de 22 dígitos.");
  const row = { user_id: userId, alias };
  return { ok: true, state: { ...state, payout_aliases: [...state.payout_aliases.filter((a) => a.user_id !== userId), row] }, data: row };
}

export const aliasOf = (s: RougeState, userId: UUID) => s.payout_aliases.find((a) => a.user_id === userId)?.alias ?? null;
