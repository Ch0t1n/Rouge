/**
 * Contrato cliente ↔ base de datos.
 * Ejecuta la parte `remote` de cada comando contra un cliente de Supabase
 * falso que registra las llamadas, y verifica contra supabase/schema.sql que:
 *   - cada RPC exista y reciba exactamente parámetros de su firma,
 *   - cada tabla exista y las columnas escritas sean columnas reales.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import * as C from "./commands";
import type { Command } from "./commands";

const SQL = readFileSync(path.resolve(__dirname, "../../../supabase/schema.sql"), "utf8");
// Los comandos usan la hora real (Date.now()): la semilla también, para que los pines de 15 min estén vigentes.
const NOW = Date.now();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const EV = DEMO_IDS.event;
const ME = DEMO_IDS.me;

/** Parámetros de cada función SQL: { join_event: ["p_code","p_mood"], ... } */
function sqlFunctions(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /create or replace function public\.(\w+)\(([\s\S]*?)\)\s*\n?\s*returns/g;
  for (const m of SQL.matchAll(re)) {
    const params = m[2]
      .split(",")
      .map((p) => p.trim().split(/\s+/)[0])
      .filter((p) => p && /^[a-z_]+$/.test(p));
    out.set(m[1], params);
  }
  return out;
}

/** Columnas de cada tabla: { profiles: Set(...), ... } */
function sqlTables(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const re = /create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g;
  for (const m of SQL.matchAll(re)) {
    const cols = new Set<string>();
    for (const line of m[2].split("\n")) {
      const c = line.trim().match(/^([a-z_]+)\s+[a-z]/);
      if (c && !["constraint", "primary", "unique"].includes(c[1])) cols.add(c[1]);
    }
    out.set(m[1], cols);
  }
  for (const m of SQL.matchAll(/alter table public\.(\w+) add column if not exists (\w+)/g)) out.get(m[1])?.add(m[2]);
  return out;
}

type Call = { kind: "rpc"; fn: string; args: Record<string, unknown> } | { kind: "table"; table: string; op: string; payload?: unknown; filters: string[] };

function fakeClient(rpcData: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const call: Call = { kind: "table", table, op: "select", filters: [] };
    const chain = {
      insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), chain),
      update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), chain),
      upsert: (payload: unknown) => ((call.op = "upsert"), (call.payload = payload), chain),
      delete: () => ((call.op = "delete"), chain),
      select: () => chain,
      eq: (col: string) => (call.filters.push(col), chain),
      in: (col: string) => (call.filters.push(col), chain),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        calls.push(call);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  };
  const sb = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ kind: "rpc", fn, args });
      return Promise.resolve({ data: rpcData[fn] ?? null, error: null });
    },
    from: builder,
  } as unknown as SupabaseClient;
  return { sb, calls };
}

async function runRemote<T>(cmd: Command<T>, s: RougeState, rpcData: Record<string, unknown> = {}) {
  const local = cmd.local(s);
  if (!local.ok) throw new Error(`${cmd.name}: la regla local rechazó el caso de prueba (${local.error})`);
  const { sb, calls } = fakeClient(rpcData);
  const data = await cmd.remote!(sb, local.data, s);
  return { calls, data, local };
}

const FUNCS = sqlFunctions();
const TABLES = sqlTables();

function checkContract(calls: Call[]) {
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) {
    if (c.kind === "rpc") {
      expect(FUNCS.has(c.fn), `RPC inexistente en schema.sql: ${c.fn}`).toBe(true);
      const params = FUNCS.get(c.fn)!;
      for (const k of Object.keys(c.args)) expect(params, `${c.fn} no tiene el parámetro ${k}`).toContain(k);
    } else {
      expect(TABLES.has(c.table), `tabla inexistente: ${c.table}`).toBe(true);
      const cols = TABLES.get(c.table)!;
      const rows = Array.isArray(c.payload) ? c.payload : c.payload ? [c.payload] : [];
      for (const row of rows) for (const k of Object.keys(row as object)) expect(cols, `${c.table}.${k} no existe`).toContain(k);
      for (const f of c.filters) expect(cols, `${c.table}.${f} (filtro) no existe`).toContain(f);
    }
  }
}

describe("contrato comandos ↔ schema.sql", () => {
  it("el parser encontró las funciones y tablas del esquema", () => {
    expect(FUNCS.get("join_event")).toEqual(["p_code", "p_mood"]);
    expect(TABLES.get("profiles")?.has("phone_normalized")).toBe(true);
    expect(TABLES.get("event_attendees")?.has("visited_sectors")).toBe(true);
  });

  const s0 = () => createSeedState(NOW);
  /** Mismo estado, actuando como la dueña del evento (acciones de staff). */
  const st = () => ({ ...s0(), current_user_id: DEMO_IDS.organizer });
  const withPin = () => {
    const r = C.dropPin(EV, ME, { x: 40, y: 30, shareWithSquad: true, matchIds: [] }).local(s0());
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };
  const squadRule = s0().perk_rules[0];
  const readyOrder = () => {
    let s = s0();
    const o = C.createBarOrder(EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup").local(s);
    if (o.ok) o.state.current_user_id = DEMO_IDS.organizer;
    if (!o.ok) throw new Error(o.error);
    s = o.state;
    for (const _ of [0, 1]) {
      const cur = s.bar_orders.find((x) => x.id === o.data.id)!;
      const r = C.advanceOrder(cur).local(s);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    return { s, code: o.data.pickup_code! };
  };

  const cases: [string, () => Promise<{ calls: Call[] }>][] = [
    ["upsertProfile (update)", () => runRemote(C.upsertProfile(ME, { bio: "Hola" }), s0())],
    ["upsertProfile (insert)", () => runRemote(C.upsertProfile("nuevo", { username: "nuevo.user", full_name: "Nuevo", birth_date: "2000-01-01", phone: "11 3333 2222" }), s0())],
    ["blockUser", () => runRemote(C.blockUser(ME, id(8)), s0())],
    ["blockPhone", () => runRemote(C.blockPhone(ME, "+1 415 555 0100"), s0())],
    ["unblock", () => runRemote(C.unblock(ME, s0().user_blocks[0].id), s0())],
    ["joinEvent", () => runRemote(C.joinEvent(ME, "BRESH26", "open_to_meet"), s0(), { join_event: EV })],
    ["updateAttendeeSettings", () => runRemote(C.updateAttendeeSettings(EV, ME, { ghost_mode: true }), s0())],
    ["sendConnection", () => runRemote(C.sendConnection(EV, ME, id(11)), s0(), { send_connection: { status: "pending" } })],
    ["respondConnection", () => runRemote(C.respondConnection(id(6002), ME, true), s0())],
    ["sendIcebreaker", () => runRemote(C.sendIcebreaker(EV, ME, id(11), { message: "hola", giftDrinkItemId: "gin" }), s0())],
    ["createSquad", () => runRemote(C.createSquad(EV, id(5), "Techno Crew"), s0())],
    ["inviteToSquad", () => runRemote(C.inviteToSquad(DEMO_IDS.squadMain, ME, id(8)), s0())],
    ["joinSquad", () => runRemote(C.joinSquad(id(8), DEMO_IDS.squadMain), s0())],
    ["leaveSquad", () => runRemote(C.leaveSquad(id(2), DEMO_IDS.squadMain), s0())],
    ["declineSquadInvite", () => runRemote(C.declineSquadInvite(id(12), id(7005)), s0())],
    ["updateSquad", () => runRemote(C.updateSquad(DEMO_IDS.squadMain, ME, { has_vip_table_to_share: true }), s0())],
    ["setSquadBasePin", () => runRemote(C.setSquadBasePin(DEMO_IDS.squadMain, ME, 10, 10, "Acá"), s0())],
    ["announceBaseMeetup", () => runRemote(C.announceBaseMeetup(DEMO_IDS.squadMain, ME, 10), s0())],
    ["triggerRescue", () => runRemote(C.triggerRescue(EV, ME, { x: 50, y: 30 }), s0())],
    ["resolveRescue", () => runRemote(C.resolveRescue(EV, ME), C.triggerRescue(EV, ME).local(s0()).ok ? (C.triggerRescue(EV, ME).local(s0()) as { state: RougeState }).state : s0())],
    ["markHomeSafe", () => runRemote(C.markHomeSafe(EV, ME), s0())],
    ["dropPin", () => runRemote(C.dropPin(EV, ME, { x: 40, y: 30, shareWithSquad: true, matchIds: [id(5)], note: "acá" }), s0())],
    ["removePin", () => runRemote(C.removePin(withPin().map_pins.find((p) => p.user_id === ME)!.id, ME, EV), withPin())],
    ["sendMessage", () => runRemote(C.sendMessage(ME, { type: "squad", squadId: DEMO_IDS.squadMain }, { content: "hola" }), s0())],
    ["requestSong", () => runRemote(C.requestSong(EV, ME, "Nuevo tema", "Artista"), s0())],
    ["toggleSongVote", () => runRemote(C.toggleSongVote(EV, s0().song_requests[0].id, ME, s0().song_requests[0].title), s0())],
    ["createBarOrder", () => runRemote(C.createBarOrder(EV, ME, [{ itemId: "gin", qty: 2 }], "fast_pickup"), s0(), { create_bar_order: { pickup_code: "ABCD" } })],
    ["advanceOrder", () => runRemote(C.advanceOrder(s0().bar_orders[3]), st())],
    ["redeemPickupCode", () => { const { s, code } = readyOrder(); return runRemote(C.redeemPickupCode(EV, code), s); }],
    ["redeemPerk", () => runRemote(C.redeemPerk(s0().user_perks_qrs.find((p) => p.status === "available")!.id), st())],
    ["upsertPerkRule", () => runRemote(C.upsertPerkRule({ ...squadRule, is_active: false }), st())],
    ["createRaffle", () => runRemote(C.createRaffle(EV, "Botella", "all"), st())],
    ["drawRaffle", () => runRemote(C.drawRaffle(s0().raffles[0].id, () => 0), st(), { draw_raffle: ME })],
    ["sendBlast", () => runRemote(C.sendBlast(EV, { title: "2x1", message: "Barra", segment: { kind: "squad_min_size", min: 4 }, flashMinutes: 20 }), st(), { send_blast: 4 })],
    ["upsertEvent (nuevo)", () => runRemote(C.upsertEvent({ name: "Neon Sunday", starts_at: new Date(NOW + 72e5).toISOString(), ends_at: new Date(NOW + 9e6).toISOString() }), s0())],
    ["upsertEvent (edición)", () => runRemote(C.upsertEvent({ ...s0().events[0], name: "Otro nombre" }), st())],
    ["generateInviteCodes", () => runRemote(C.generateInviteCodes(EV, 5), st(), { generate_invite_codes: [] })],
    ["setStaffRole", () => runRemote(C.setStaffRole(EV, "@" + s0().profiles.find((p) => p.id === ME)!.username, "bartender"), st(), { set_staff_role: ME })],
    ["setStaffRole (quitar)", () => runRemote(C.setStaffRole(EV, "dani.barra", null), st(), { set_staff_role: DEMO_IDS.bartender })],
  ];

  it.each(cases)("%s respeta el esquema", async (_name, fn) => {
    const { calls } = await fn();
    checkContract(calls);
  });

  it("los comandos que el servidor resuelve devuelven los datos del servidor", async () => {
    const order = await runRemote(C.createBarOrder(EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup"), s0(), { create_bar_order: { id: "srv", pickup_code: "SRV1" } });
    expect((order.data as { pickup_code: string }).pickup_code).toBe("SRV1");
    const raffle = await runRemote(C.drawRaffle(s0().raffles[0].id, () => 0), st(), { draw_raffle: id(8) });
    expect((raffle.data as { raffle: { winner_user_id: string } }).raffle.winner_user_id).toBe(id(8));
    const blast = await runRemote(C.sendBlast(EV, { title: "x", message: "y", segment: { kind: "all" } }), st(), { send_blast: 99 });
    expect((blast.data as { reach: number }).reach).toBe(99);
  });

  it("el perfil nuevo se inserta y el existente se actualiza sin tocar el id", async () => {
    const ins = await runRemote(C.upsertProfile("nuevo", { username: "nuevo.user", full_name: "Nuevo", birth_date: "2000-01-01" }), s0());
    expect(ins.calls[0]).toMatchObject({ kind: "table", table: "profiles", op: "insert" });
    const upd = await runRemote(C.upsertProfile(ME, { bio: "Hola" }), s0());
    expect(upd.calls[0]).toMatchObject({ kind: "table", table: "profiles", op: "update" });
    expect(Object.keys((upd.calls[0] as { payload: object }).payload)).not.toContain("id");
  });

  it("todas las acciones del motor usadas por la UI tienen comando remoto", () => {
    const names = Object.values(C).filter((v) => typeof v === "function");
    expect(names.length).toBeGreaterThanOrEqual(35);
  });
});

describe("contrato del cargador (fetchRemoteState) ↔ schema.sql", () => {
  it("lee solo tablas, columnas y RPC que existen, y arma un RougeState válido", async () => {
    const { fetchRemoteState } = await import("@/lib/supabase/sync");
    const seed = createSeedState(Date.now());
    const reads: { table?: string; select?: string; filters: string[]; rpc?: string; args?: Record<string, unknown> }[] = [];
    const tableData: Record<string, unknown[]> = {
      events: seed.events.map((e) => ({ ...e, created_by: ME })),
      event_attendees: seed.event_attendees,
      event_staff: [],
      connections: seed.connections,
      profiles: seed.profiles.map(({ phone_normalized: _p, ...rest }) => rest),
      bar_menu_items: seed.bar_menu.map((i) => ({ ...i, is_available: true, price: String(i.price) })),
    };
    const sb = {
      from: (table: string) => {
        const r: (typeof reads)[number] = { table, filters: [] };
        reads.push(r);
        const chain = {
          select: (cols = "*") => ((r.select = cols), chain),
          eq: (c: string) => (r.filters.push(c), chain),
          in: (c: string) => (r.filters.push(c), chain),
          order: (c: string) => (r.filters.push(c), chain),
          limit: () => chain,
          then: (res: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: tableData[table] ?? [], error: null }).then(res),
        };
        return chain;
      },
      rpc: (fn: string, args: Record<string, unknown> = {}) => {
        reads.push({ rpc: fn, args, filters: [] });
        const data = fn === "my_profile" ? [{ ...seed.profiles.find((p) => p.id === ME) }] : fn === "event_crm" ? [{ user_id: id(5), phone: "+5491150001005" }] : [];
        return { then: (res: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(res), catch: () => undefined };
      },
    } as unknown as SupabaseClient;

    const snap = await fetchRemoteState(sb, ME, EV);
    for (const r of reads) {
      if (r.rpc) {
        expect(FUNCS.has(r.rpc), `RPC inexistente: ${r.rpc}`).toBe(true);
        for (const k of Object.keys(r.args ?? {})) expect(FUNCS.get(r.rpc)).toContain(k);
        continue;
      }
      const cols = TABLES.get(r.table!);
      expect(cols, `tabla inexistente: ${r.table}`).toBeTruthy();
      if (r.select && r.select !== "*") for (const c of r.select.split(",")) expect(cols, `${r.table}.${c}`).toContain(c);
      for (const f of r.filters) expect(cols, `${r.table}.${f} (filtro)`).toContain(f);
    }
    // El teléfono nunca se pide en el select de profiles (column privileges)
    expect(reads.find((r) => r.table === "profiles")?.select).not.toMatch(/phone/);
    expect(snap.isStaff).toBe(true); // created_by = yo
    expect(snap.state.active_event_id).toBe(EV);
    expect(snap.state.profiles.find((p) => p.id === ME)?.phone_normalized).toBe(seed.profiles.find((p) => p.id === ME)?.phone_normalized);
    expect(snap.state.profiles.find((p) => p.id === id(5))?.phone_normalized).toBe("+5491150001005"); // vía event_crm (staff)
    expect(snap.state.bar_menu[0].price).toBeTypeOf("number");
  });
});

describe("acciones con datos generados por el servidor", () => {
  it("no son optimistas: nunca se muestra un código inventado en el cliente", () => {
    const s = createSeedState(Date.now());
    const cmds = [
      C.createSquad(EV, id(5), "x"),
      C.createBarOrder(EV, ME, [{ itemId: "gin", qty: 1 }], "fast_pickup"),
      C.generateInviteCodes(EV, 1),
      C.drawRaffle(s.raffles[0].id, () => 0),
      C.joinEvent(ME, "BRESH26", "open_to_meet"),
      C.setStaffRole(EV, "dani.barra", "waiter"),
    ];
    for (const c of cmds) expect(c.optimistic, c.name).toBe(false);
    // y las de interacción inmediata sí lo son (UI instantánea con mala señal)
    for (const c of [C.sendMessage(ME, { type: "squad", squadId: DEMO_IDS.squadMain }, { content: "hola" }), C.triggerRescue(EV, ME), C.dropPin(EV, ME, { x: 1, y: 1, shareWithSquad: true, matchIds: [] })])
      expect(c.optimistic, c.name).not.toBe(false);
  });
});

describe("permisos por rol (misma regla que has_staff_role en SQL)", () => {
  const as = (userId: string) => ({ ...createSeedState(Date.now()), current_user_id: userId });
  const order = () => createSeedState(Date.now()).bar_orders.find((o) => o.status === "pending")!;
  it("barra y mozo/a operan comandas; asistente y seguridad no", () => {
    expect(C.advanceOrder(order()).local(as(DEMO_IDS.bartender)).ok).toBe(true);
    expect(C.advanceOrder(order()).local(as(DEMO_IDS.waiter)).ok).toBe(true);
    expect(C.advanceOrder(order()).local(as(DEMO_IDS.security))).toMatchObject({ ok: false });
    expect(C.advanceOrder(order()).local(as(ME))).toMatchObject({ ok: false });
    expect(C.advanceOrder(order(), { simulate: true }).local(as(ME)).ok).toBe(true); // demo
  });
  it("blasts, sorteos y códigos: solo dueño/a y producción", () => {
    const blast = () => C.sendBlast(EV, { title: "t", message: "m", segment: { kind: "all" } });
    expect(blast().local(as(DEMO_IDS.organizer)).ok).toBe(true);
    expect(blast().local(as(DEMO_IDS.manager)).ok).toBe(true);
    for (const u of [DEMO_IDS.bartender, DEMO_IDS.waiter, DEMO_IDS.security, ME]) expect(blast().local(as(u)).ok, u).toBe(false);
    expect(C.generateInviteCodes(EV, 3).local(as(DEMO_IDS.bartender)).ok).toBe(false);
    expect(C.createRaffle(EV, "x", "all").local(as(DEMO_IDS.security)).ok).toBe(false);
  });
  it("la barra canjea QRs de perks; mozo/a no", () => {
    const qr = createSeedState(Date.now()).user_perks_qrs.find((p) => p.status === "available")!.qr_code_string;
    expect(C.redeemPerk(qr).local(as(DEMO_IDS.bartender)).ok).toBe(true);
    expect(C.redeemPerk(qr).local(as(DEMO_IDS.waiter)).ok).toBe(false);
  });
  it("solo dueño/a arma el equipo; producción no puede darse más permisos", () => {
    const r = C.setStaffRole(EV, "dani.barra", "manager").local(as(DEMO_IDS.organizer));
    expect(r.ok && r.state.event_staff.find((x) => x.user_id === DEMO_IDS.bartender)?.role).toBe("manager");
    expect(C.setStaffRole(EV, "lucho.produccion", "owner").local(as(DEMO_IDS.manager)).ok).toBe(false);
    expect(C.setStaffRole(EV, "paula.owner", null).local(as(DEMO_IDS.organizer))).toMatchObject({ ok: false, error: "Quien creó el evento siempre es dueño/a." });
    const removed = C.setStaffRole(EV, "marta.seguridad", null).local(as(DEMO_IDS.organizer));
    expect(removed.ok && removed.state.event_staff.some((x) => x.user_id === DEMO_IDS.security)).toBe(false);
    expect(C.setStaffRole(EV, "no.existe", "waiter").local(as(DEMO_IDS.organizer)).ok).toBe(false);
    expect(C.setStaffRole(EV, "no.existe", "waiter", { serverLookup: true }).local(as(DEMO_IDS.organizer)).ok).toBe(true);
  });
  it("cualquiera crea un evento nuevo, pero solo el staff con permiso edita uno existente", () => {
    const s = as(ME);
    const start = new Date(Date.now() + 72e5).toISOString();
    const end = new Date(Date.now() + 9e6).toISOString();
    expect(C.upsertEvent({ name: "Mi fiesta", starts_at: start, ends_at: end }).local(s).ok).toBe(true);
    expect(C.upsertEvent({ ...s.events[0], name: "Hackeado" }).local(s).ok).toBe(false);
    expect(C.upsertEvent({ ...s.events[0], name: "Renombrado" }).local(as(DEMO_IDS.manager)).ok).toBe(true);
  });
});
