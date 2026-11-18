/**
 * Integración REAL contra un Supabase de prueba (local o de staging).
 * Usa el código de la app (commands.ts + fetchRemoteState) con usuarios reales,
 * sesiones propias y RLS. Se saltea si no hay credenciales:
 *
 *   SUPABASE_TEST_URL=http://localhost:8000 \
 *   SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_KEY=... npm run test:integration
 *
 * Requiere schema.sql + seed.sql aplicados. Crea usuarios con emails únicos por corrida.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { RougeEvent, RougeState, UUID } from "@/lib/types";
import { fetchRemoteState } from "@/lib/supabase/sync";
import * as C from "./commands";
import { localParts } from "@/lib/engine/schedule";
import { dynamicQrValue } from "@/lib/engine/qr";
import type { Command } from "./commands";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY;
const EV = "00000000-0000-4000-8000-000000001000"; // evento de supabase/seed.sql
const RUN = Date.now().toString(36);

interface Actor {
  name: string;
  id: UUID;
  sb: SupabaseClient;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function actor(admin: SupabaseClient, name: string): Promise<Actor> {
  const email = `${name}.${RUN}@rouge.test`;
  const password = `Rouge-${RUN}-pass!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const sb = createClient(URL!, ANON!, opts);
  const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { name, id: data.user!.id, sb };
}

/** Igual que exec() en Supabase: estado real → regla local → contraparte remota. */
async function act<T>(a: Actor, cmd: Command<T>, eventId: UUID = EV): Promise<T> {
  const { state } = await fetchRemoteState(a.sb, a.id, eventId);
  const local = cmd.local(state);
  if (!local.ok) throw new Error(`[${a.name}] ${cmd.name} rechazado localmente: ${local.error}`);
  const data = await cmd.remote!(a.sb, local.data, state);
  return (data ?? local.data) as T;
}

/** Espera que el servidor rechace (la regla local se saltea para probar RLS/RPC directamente). */
async function rejects<T>(a: Actor, cmd: Command<T>, local: T, state: RougeState) {
  let err: unknown = null;
  try {
    await cmd.remote!(a.sb, local, state);
  } catch (e) {
    err = e;
  }
  return err as { message?: string } | null;
}

const snap = (a: Actor, ev = EV) => fetchRemoteState(a.sb, a.id, ev).then((x) => x.state);

describe.skipIf(!URL || !ANON || !SERVICE)("Supabase real: flujo completo con RLS", () => {
  let admin: SupabaseClient;
  let sofi: Actor, cami: Actor, mateo: Actor, staff: Actor;
  const phone = (n: number) => `11 ${String(3000 + (parseInt(RUN.slice(-4), 36) % 6000)).padStart(4, "0")}-${String(1000 + n)}`;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, opts);
    [sofi, cami, mateo, staff] = await Promise.all(["sofi", "cami", "mateo", "staff"].map((n) => actor(admin, n)));
  }, 60_000);

  it("onboarding: crea perfiles (insert) y los edita (update)", async () => {
    const genres = { sofi: ["House", "Techno", "Pop"], cami: ["House", "Pop"], mateo: ["Techno", "House"], staff: ["House"] } as const;
    for (const [i, a] of [sofi, cami, mateo, staff].entries()) {
      await act(a, C.upsertProfile(a.id, { username: `${a.name}.${RUN}`, full_name: `${a.name[0].toUpperCase()}${a.name.slice(1)} Test`, birth_date: "1999-05-05", gender: "female", phone: phone(i), music_genres: [...genres[a.name as keyof typeof genres]] }));
    }
    await act(sofi, C.upsertProfile(sofi.id, { bio: "Si suena house, estoy en primera fila" }));
    // El dueño del evento del seed suma a la persona de staff (event_staff → profiles).
    const { error } = await admin.from("event_staff").insert({ event_id: EV, user_id: staff.id, role: "owner" });
    if (error) throw error;
    const me = (await snap(sofi)).profiles.find((p) => p.id === sofi.id)!;
    expect(me.bio).toMatch(/primera fila/);
    expect(me.phone_normalized).toMatch(/^\+549/); // mi propio teléfono sí (my_profile)
  });

  it("el teléfono de otros NUNCA es legible (column privileges)", async () => {
    const { error } = await cami.sb.from("profiles").select("phone_normalized").eq("id", sofi.id);
    expect(error).not.toBeNull();
    const other = (await snap(cami)).profiles.find((p) => p.id === sofi.id);
    expect(other?.phone_normalized ?? null).toBeNull();
  });

  it("ingreso por código maestro y por slug + mood", async () => {
    for (const a of [sofi, cami, mateo]) {
      const r = await act(a, C.joinEvent(a.id, a === mateo ? "bresh-sabado" : "BRESH26", "open_to_meet"));
      expect(r.eventId).toBe(EV);
    }
    const s = await snap(sofi);
    expect(s.event_attendees.map((x) => x.user_id)).toEqual(expect.arrayContaining([sofi.id, cami.id, mateo.id]));
  });

  it("squad: crear, invitar, unirse (RPCs con RLS)", async () => {
    const squad = await act(sofi, C.createSquad(EV, sofi.id, "Las Pibas Test"));
    expect(squad.invite_code).toMatch(/^SQ-/);
    await act(sofi, C.inviteToSquad(squad.id, sofi.id, cami.id));
    await act(cami, C.joinSquad(cami.id, squad.id));
    const s = await snap(cami);
    expect(s.squad_members.filter((m) => m.squad_id === squad.id && m.status === "joined")).toHaveLength(2);
    // Mateo no ve el squad (no es miembro ni hay Mesa VIP)
    expect((await snap(mateo)).squads.some((x) => x.id === squad.id)).toBe(false);
  });

  it("like recíproco = match; chat 1:1 solo visible para el match", async () => {
    await act(mateo, C.sendConnection(EV, mateo.id, sofi.id));
    const r = await act(sofi, C.sendConnection(EV, sofi.id, mateo.id));
    expect(r.matched).toBe(true);
    const conn = (await snap(sofi)).connections.find((c) => c.status === "accepted" && [c.sender_id, c.receiver_id].includes(mateo.id))!;
    await act(sofi, C.sendMessage(sofi.id, { type: "direct", connectionId: conn.id }, { content: "¡Hola Mateo!" }));
    expect((await snap(mateo)).messages.some((m) => m.content === "¡Hola Mateo!")).toBe(true);
    expect((await snap(cami)).messages.some((m) => m.content === "¡Hola Mateo!")).toBe(false);
  });

  it("pin-drop: el squad lo ve; un match solo si fue elegido", async () => {
    await act(sofi, C.dropPin(EV, sofi.id, { x: 40, y: 30, shareWithSquad: true, matchIds: [] }));
    expect((await snap(cami)).map_pins.some((p) => p.user_id === sofi.id)).toBe(true);
    expect((await snap(mateo)).map_pins.some((p) => p.user_id === sofi.id)).toBe(false);
    await act(sofi, C.dropPin(EV, sofi.id, { x: 40, y: 30, shareWithSquad: true, matchIds: [mateo.id] }));
    expect((await snap(mateo)).map_pins.some((p) => p.user_id === sofi.id)).toBe(true);
    // visited_sectors por trigger
    expect((await snap(sofi)).event_attendees.find((a) => a.user_id === sofi.id)?.visited_sectors).toContain("Pista Principal");
  });

  it("rescate: alerta en el chat del squad", async () => {
    await act(sofi, C.triggerRescue(EV, sofi.id));
    const s = await snap(cami);
    expect(s.messages.some((m) => m.message_type === "system_alert" && m.content.startsWith("🚨"))).toBe(true);
    expect(s.squad_members.find((m) => m.user_id === sofi.id)?.safety_status).toBe("rescue_needed");
    await act(sofi, C.resolveRescue(EV, sofi.id));
  });

  it("bloqueo por teléfono = invisibilidad mutua (y se revierte)", async () => {
    await act(sofi, C.blockPhone(sofi.id, phone(1))); // teléfono de Cami
    expect((await snap(sofi)).event_attendees.some((a) => a.user_id === cami.id)).toBe(false);
    expect((await snap(cami)).event_attendees.some((a) => a.user_id === sofi.id)).toBe(false);
    const block = (await snap(sofi)).user_blocks[0];
    await act(sofi, C.unblock(sofi.id, block.id));
    expect((await snap(sofi)).event_attendees.some((a) => a.user_id === cami.id)).toBe(true);
  });

  it("rompehielos con trago: QR para el receptor y bala única", async () => {
    await act(mateo, C.sendIcebreaker(EV, mateo.id, cami.id, { message: "¿Bailamos?", giftDrinkItemId: "gin" }));
    expect((await snap(cami)).user_perks_qrs.some((p) => p.perk_type === "gifted_drink")).toBe(true);
    const s = await snap(mateo);
    const err = await rejects(mateo, C.sendIcebreaker(EV, mateo.id, sofi.id, { message: "otro" }), s.connections[0], s);
    expect(err?.message).toBe("icebreaker_already_used");
  });

  it("barra: código de retiro del servidor, comanda solo staff y entrega por código", async () => {
    const order = await act(cami, C.createBarOrder(EV, cami.id, [{ itemId: "aperol", qty: 2 }], "fast_pickup"));
    expect(Number(order.total_amount)).toBe(17000); // precio del menú del servidor
    const s = await snap(cami);
    expect(await rejects(cami, C.advanceOrder(order), order, s)).toMatchObject({ message: "forbidden" });
    await act(staff, C.advanceOrder(order));
    const preparing = (await snap(staff)).bar_orders.find((o) => o.id === order.id)!;
    await act(staff, C.advanceOrder(preparing));
    const done = await act(staff, C.redeemPickupCode(EV, `ROUGE:ORDER:${order.id}:${order.pickup_code}`));
    expect(done.status).toBe("completed");
  });

  it("text blast segmentado llega solo a su audiencia; no-staff rechazado", async () => {
    const r = await act(staff, C.sendBlast(EV, { title: "2x1 Test", message: "Barra Terraza", segment: { kind: "squad_min_size", min: 2 }, flashMinutes: 20 }));
    expect(r.reach).toBeGreaterThanOrEqual(2); // squads de 2+ (la base puede tener corridas anteriores)
    expect((await snap(cami)).event_blasts.some((b) => b.title === "2x1 Test")).toBe(true);
    expect((await snap(mateo)).event_blasts.some((b) => b.title === "2x1 Test")).toBe(false);
    const s = await snap(cami);
    expect(await rejects(cami, C.sendBlast(EV, { title: "x", message: "y", segment: { kind: "all" } }), { blast: s.event_blasts[0], reach: 0 }, s)).toMatchObject({ message: "forbidden" });
  });

  it("sorteo: el servidor elige ganador, recibe QR y staff lo canjea", async () => {
    const raffle = await act(staff, C.createRaffle(EV, "Botella Test", "in_squad"));
    const r = await act(staff, C.drawRaffle(raffle.id, () => 0));
    const winnerId = r.raffle.winner_user_id!;
    // La base puede tener squads de corridas anteriores: el ganador es cualquier integrante de un squad del evento.
    const members = (await snap(staff)).squad_members.filter((m) => m.status === "joined").map((m) => m.user_id);
    expect(members).toContain(winnerId);
    const { data: perk } = await admin.from("user_perks_qrs").select("qr_code_string").eq("user_id", winnerId).eq("source_ref_id", raffle.id).single();
    expect(perk).toBeTruthy();
    const redeemed = await act(staff, C.redeemPerk(perk!.qr_code_string));
    expect(redeemed.status).toBe("redeemed");
  });

  it("métricas del staff: conteos agregados sin exponer las conexiones", async () => {
    const st = await snap(staff);
    expect(st.connections).toHaveLength(0); // el staff NO ve quién hizo match con quién
    expect(st.admin_stats?.matches).toBeGreaterThanOrEqual(1);
    expect(st.admin_stats?.matches_by_user[sofi.id]).toBeGreaterThanOrEqual(1);
    expect(st.squad_members.length).toBeGreaterThanOrEqual(2); // composición de squads sí (operativo)
    const { error } = await cami.sb.rpc("event_stats", { p_event: EV });
    expect(error?.message).toBe("forbidden");
  });

  it("CRM con teléfonos solo para staff; códigos de 1 uso", async () => {
    const st = await snap(staff);
    expect(st.profiles.find((p) => p.id === sofi.id)?.phone_normalized).toMatch(/^\+549/);
    const { error } = await cami.sb.rpc("event_crm", { p_event: EV });
    expect(error?.message).toBe("forbidden");
    const codes = await act(staff, C.generateInviteCodes(EV, 5));
    expect(codes).toHaveLength(5);
  });

  it("códigos que el cliente no ve por RLS: 1 uso y link de Squad ajeno (resolve_access_code)", async () => {
    const [nico, vale] = await Promise.all(["nico", "vale"].map((n) => actor(admin, n)));
    for (const [i, a] of [nico, vale].entries()) {
      await act(a, C.upsertProfile(a.id, { username: `${a.name}.${RUN}`, full_name: `${a.name} Test`, birth_date: "1998-01-01", phone: phone(10 + i), music_genres: ["House"] }));
    }
    const code = (await act(staff, C.generateInviteCodes(EV, 1)))[0].code;
    // Sin sesión también se puede previsualizar
    const anonSb = createClient(URL!, ANON!, opts);
    const { data: pv } = await anonSb.rpc("resolve_access_code", { p_code: code });
    expect(pv).toMatchObject({ via: "single_use_code", code_used_by_other: false, event: { id: EV } });
    // Nico no puede ver el código (RLS) → la regla local lo delega al servidor
    expect((await snap(nico)).event_invite_codes).toHaveLength(0);
    await act(nico, C.joinEvent(nico.id, code, "open_to_meet", EV));
    const { data: used } = await anonSb.rpc("resolve_access_code", { p_code: code });
    expect(used.code_used_by_other).toBe(true);
    const err = await rejects(vale, C.joinEvent(vale.id, code, "open_to_meet", EV), { eventId: EV }, await snap(vale));
    expect(err?.message).toBe("code_already_used");
    // Link de Squad ajeno: Vale entra y queda en el squad de Sofía
    const sq = (await snap(sofi)).squads.find((x) => x.created_by === sofi.id)!;
    const { data: sqPv } = await anonSb.rpc("resolve_access_code", { p_code: sq.invite_code });
    expect(sqPv).toMatchObject({ via: "squad_link", squad: { name: sq.name } });
    await act(vale, C.joinEvent(vale.id, sq.invite_code, "with_friends", EV));
    expect((await snap(vale)).squad_members.some((m) => m.squad_id === sq.id && m.user_id === vale.id && m.status === "joined")).toBe(true);
  });

  it("crear evento nuevo: quien lo crea queda como staff y con menú", async () => {
    // [v1.8] Crear eventos exige autogestión habilitada por ROUGE HQ (can_manage_modules): la habilita el servidor.
    const { error: selfService } = await admin.from("organization_settings").upsert([sofi, cami, mateo, staff].map((a) => ({ organization_id: a.id, allow_owner_self_service: true })));
    expect(selfService).toBeNull();
    const start = new Date(Date.now() + 72 * 3_600_000).toISOString();
    const ev = await act(sofi, C.upsertEvent({ name: `Neon ${RUN}`, starts_at: start, ends_at: new Date(Date.now() + 78 * 3_600_000).toISOString() }));
    const remote = await fetchRemoteState(sofi.sb, sofi.id, ev.id);
    expect(remote.isStaff).toBe(true);
    expect(remote.state.bar_menu.length).toBeGreaterThan(5);
  });

  it("roles: barra opera comandas pero no manda blasts; seguridad ve métricas pero no teléfonos", async () => {
    const [barra, segu] = await Promise.all(["barra", "segu"].map((n) => actor(admin, n)));
    for (const [i, a] of [barra, segu].entries()) {
      await act(a, C.upsertProfile(a.id, { username: `${a.name}.${RUN}`, full_name: `${a.name} Test`, birth_date: "1995-01-01", phone: phone(20 + i) }));
    }
    // La dueña arma el equipo por @username (el perfil no está cargado en su cliente → lo busca la RPC)
    await act(staff, C.setStaffRole(EV, `@barra.${RUN}`, "bartender", { serverLookup: true }));
    await act(staff, C.setStaffRole(EV, `segu.${RUN}`, "security", { serverLookup: true }));

    const bs = await fetchRemoteState(barra.sb, barra.id, EV);
    expect(bs.isStaff).toBe(true);
    expect(bs.state.event_staff.find((r) => r.user_id === barra.id)?.role).toBe("bartender");
    expect(bs.state.event_invite_codes).toHaveLength(0); // accesos: solo dueño/a y producción
    expect(bs.state.admin_stats ?? null).toBeNull();
    const order = await act(cami, C.createBarOrder(EV, cami.id, [{ itemId: "aperol", qty: 1 }], "fast_pickup"));
    const prep = await act(barra, C.advanceOrder(order));
    expect(prep.status).toBe("preparing");
    const blast = C.sendBlast(EV, { title: "x", message: "y", segment: { kind: "all" } });
    expect(await rejects(barra, blast, { blast: bs.state.event_blasts[0], reach: 0 }, bs.state)).toMatchObject({ message: "forbidden" });
    for (const [fn, args] of [["event_crm", { p_event: EV }], ["generate_invite_codes", { p_event: EV, p_count: 1 }], ["set_staff_role", { p_event: EV, p_username: `barra.${RUN}`, p_role: "owner" }]] as const) {
      expect((await barra.sb.rpc(fn, args)).error?.message, fn).toBe("forbidden");
    }
    // Tampoco puede darse permisos por la tabla (RLS)
    await barra.sb.from("event_staff").update({ role: "owner" }).eq("user_id", barra.id);
    expect((await fetchRemoteState(barra.sb, barra.id, EV)).state.event_staff.find((r) => r.user_id === barra.id)?.role).toBe("bartender");

    const ss = await fetchRemoteState(segu.sb, segu.id, EV);
    expect(ss.state.admin_stats?.matches).toBeGreaterThanOrEqual(1);
    expect(ss.state.profiles.find((p) => p.id === sofi.id)?.phone_normalized ?? null).toBeNull();
    expect((await segu.sb.rpc("advance_bar_order", { p_order: order.id })).error?.message).toBe("forbidden");

    await act(staff, C.setStaffRole(EV, `segu.${RUN}`, null, { serverLookup: true }));
    expect((await fetchRemoteState(segu.sb, segu.id, EV)).isStaff).toBe(false);
  });

  it("instagram: tokens invisibles, verificado lo decide el servidor y el login con IG antes del onboarding", async () => {
    // @ escrito a mano → sin verificar
    await act(mateo, C.upsertProfile(mateo.id, { instagram_username: "@Mateo.Manual" }));
    let p = (await snap(sofi)).profiles.find((x) => x.id === mateo.id);
    expect(p).toMatchObject({ instagram_username: "mateo.manual", instagram_verified: false });
    // El cliente no puede marcarse verificado (column privileges) ni leer tokens
    const { error: upErr } = await mateo.sb.from("profiles").update({ instagram_verified: true }).eq("id", mateo.id);
    expect(upErr).not.toBeNull();
    // Conexión OAuth (la escribe /api/instagram/callback con service role)
    const ig = `ig${RUN}`.slice(0, 20);
    await admin.from("instagram_accounts").insert({ user_id: mateo.id, ig_user_id: `9${Date.now()}`, username: ig, account_type: "CREATOR", access_token: "SECRETO" });
    await admin.from("profiles").update({ instagram_username: ig }).eq("id", mateo.id);
    p = (await snap(sofi)).profiles.find((x) => x.id === mateo.id);
    expect(p).toMatchObject({ instagram_username: ig, instagram_verified: true }); // lo ve otro asistente, verificado
    const { data: leaked } = await sofi.sb.from("instagram_accounts").select("*");
    expect(leaked ?? []).toHaveLength(0);
    const { data: own } = await mateo.sb.from("instagram_accounts").select("access_token");
    expect(own ?? []).toHaveLength(0); // ni el dueño lee su token desde el cliente
    const mine = await snap(mateo);
    expect(mine.instagram_links).toEqual([expect.objectContaining({ user_id: mateo.id, username: ig })]);
    // Si después escribe otro @ a mano, deja de estar verificado
    await act(mateo, C.upsertProfile(mateo.id, { instagram_username: "otro.handle" }));
    expect((await snap(sofi)).profiles.find((x) => x.id === mateo.id)?.instagram_verified).toBe(false);

    // Login con Instagram ANTES del onboarding: el perfil nace con el @ verificado (trigger)
    const nuevo = await actor(admin, "ignuevo");
    const ig2 = `n${RUN}`.slice(0, 20);
    await admin.from("instagram_accounts").insert({ user_id: nuevo.id, ig_user_id: `8${Date.now()}`, username: ig2, access_token: "SECRETO2" });
    await act(nuevo, C.upsertProfile(nuevo.id, { username: `ign.${RUN}`.slice(0, 20), full_name: "IG Nuevo", birth_date: "1997-03-03", phone: phone(30) }));
    expect((await snap(nuevo)).profiles.find((x) => x.id === nuevo.id)).toMatchObject({ instagram_username: ig2, instagram_verified: true });
  });

  it("API v1: claves, códigos por entrada idempotentes, anulación y funciones cerradas para clientes", async () => {
    const { hashApiKey } = await import("@/lib/api/v1");
    // La dueña (staff) crea una clave para el evento: la clave completa vuelve UNA vez
    const created = await act(staff, C.createApiKey(`Ticketera ${RUN}`, EV));
    expect(created.secret).toMatch(/^rk_live_[0-9a-f]{10}_[0-9a-f]{48}$/);
    const mine = await snap(staff);
    expect(mine.api_keys.find((k) => k.id === created.key.id)).toMatchObject({ prefix: created.key.prefix, event_id: EV, revoked_at: null });
    // El hash no es legible desde el cliente (privilegios por columna)
    const { error: hashErr } = await staff.sb.from("api_keys").select("key_hash").eq("id", created.key.id);
    expect(hashErr).not.toBeNull();
    // Un asistente no puede crear claves ni usar las funciones de la API
    expect(await rejects(cami, C.createApiKey("x", EV), created, await snap(cami))).toMatchObject({ message: "forbidden" });
    for (const [fn, args] of [
      ["api_issue_codes", { p_key: created.key.id, p_event: EV, p_count: 1 }],
      ["api_authorize", { p_key: created.key.id, p_event: EV, p_scope: "codes:read" }],
      ["api_revoke_code", { p_key: created.key.id, p_event: EV, p_code: "X" }],
    ] as const) {
      expect((await cami.sb.rpc(fn, args)).error, fn).not.toBeNull();
    }
    // El servidor (service role) autentica por hash y emite un código por entrada, idempotente
    const { data: key } = await admin.from("api_keys").select("id").eq("key_hash", hashApiKey(created.secret)).single();
    expect(key?.id).toBe(created.key.id);
    const tickets = [{ external_ref: `ORD-${RUN}-1`, label: "VIP" }, { external_ref: `ORD-${RUN}-2` }];
    const first = await admin.rpc("api_issue_codes", { p_key: key!.id, p_event: EV, p_tickets: tickets, p_label: "General" });
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(2);
    expect(first.data.every((r: { created: boolean; code: string }) => r.created && /^[A-HJ-NP-Z2-9]{10}$/.test(r.code))).toBe(true);
    const again = await admin.rpc("api_issue_codes", { p_key: key!.id, p_event: EV, p_tickets: tickets });
    expect(again.data.map((r: { code: string }) => r.code).sort()).toEqual(first.data.map((r: { code: string }) => r.code).sort());
    expect(again.data.every((r: { created: boolean }) => !r.created)).toBe(true);
    // Un asistente entra con el código de su entrada; el otro se anula (reembolso) y deja de servir
    const [used, refunded] = first.data as { code: string }[];
    const comprador = await actor(admin, "comprador");
    await act(comprador, C.upsertProfile(comprador.id, { username: `compra.${RUN}`.slice(0, 20), full_name: "Comprador", birth_date: "1996-06-06", phone: phone(40) }));
    await act(comprador, C.joinEvent(comprador.id, used.code, "open_to_meet", EV));
    const rv = await admin.rpc("api_revoke_code", { p_key: key!.id, p_event: EV, p_code: refunded.code });
    expect(rv.data.revoked_at).toBeTruthy();
    expect((await admin.rpc("api_revoke_code", { p_key: key!.id, p_event: EV, p_code: used.code })).error?.message).toBe("code_already_used");
    const anonSb = createClient(URL!, ANON!, opts);
    expect((await anonSb.rpc("resolve_access_code", { p_code: refunded.code })).data).toBeNull();
    // Revocar la clave la deja sin acceso
    await act(staff, C.revokeApiKey(created.key.id));
    expect((await admin.rpc("api_authorize", { p_key: key!.id, p_event: EV, p_scope: "codes:read" })).data).toBe(false);
  });

  it("marca y cobros: colores validados, el cobro lo prende solo el servidor y la barra no prepara lo que no se pagó", async () => {
    // Mateo arma su marca y un evento con esa marca (lobby abierto ya)
    const brand = await act(mateo, C.upsertBrand({ name: `Neón ${RUN}`, primary_color: "#8B5CF6", logo_url: "/demo/brands/rouge-night.svg" }));
    const { error: darkErr } = await mateo.sb.from("brands").update({ primary_color: "#111111" }).eq("id", brand.id);
    expect(darkErr).not.toBeNull(); // mismo control de contraste en SQL
    const { error: payErr } = await mateo.sb.from("brands").update({ payments_enabled: true }).eq("id", brand.id);
    expect(payErr).not.toBeNull(); // payments_enabled: solo el servidor
    const ev = await act(mateo, C.upsertEvent({ name: `Club ${RUN}`, starts_at: new Date(Date.now() + 3_600_000).toISOString(), ends_at: new Date(Date.now() + 5 * 3_600_000).toISOString(), brand_id: brand.id, theme_accent: "#C6FF3D" }));
    // Nadie puede ponerle a su evento una marca ajena
    const sofiEvent = (await snap(sofi)).events.find((e) => e.created_by === sofi.id && e.name === `Neon ${RUN}`)!;
    const { error: stolen } = await sofi.sb.from("events").update({ brand_id: brand.id }).eq("id", sofiEvent.id);
    expect(stolen?.message).toBe("brand_not_owned");
    // /join sin sesión ya trae logo y colores
    const anon = createClient(URL!, ANON!, opts);
    const { data: preview } = await anon.rpc("resolve_access_code", { p_code: ev.slug });
    expect(preview).toMatchObject({ event: { theme_accent: "#C6FF3D" }, brand: { primary_color: "#8B5CF6" } });

    // Cami entra; sin Mercado Pago conectado se paga en la barra
    await act(cami, C.joinEvent(cami.id, ev.master_invite_code, "just_dance"), ev.id);
    const atBar = await act(cami, C.createBarOrder(ev.id, cami.id, [{ itemId: "gin", qty: 1 }], "fast_pickup"), ev.id);
    expect(atBar.payment_status).toBe("pay_at_bar");

    // El servidor conecta Mercado Pago (lo hace /api/mercadopago/callback con service role)
    await admin.from("brands").update({ payments_enabled: true }).eq("id", brand.id);
    const order = await act(cami, C.createBarOrder(ev.id, cami.id, [{ itemId: "gin", qty: 2 }], "fast_pickup"), ev.id);
    expect(order.payment_status).toBe("awaiting_payment");
    const s = await snap(mateo, ev.id);
    expect(await rejects(mateo, C.advanceOrder(order), order, s)).toMatchObject({ message: "not_paid" });
    // Nadie con sesión acredita pagos ni toca el estado de pago
    const { error: rpcErr } = await cami.sb.rpc("confirm_order_payment", { p_order: order.id, p_payment_ref: "x", p_amount: 16000 });
    expect(rpcErr).not.toBeNull();
    const { error: colErr } = await mateo.sb.from("bar_orders").update({ payment_status: "paid" }).eq("id", order.id);
    expect(colErr).not.toBeNull();
    // El servidor acredita con el monto exacto (idempotente) y recién ahí suma el gasto
    const { error: wrong } = await admin.rpc("confirm_order_payment", { p_order: order.id, p_payment_ref: "mp-1", p_amount: 100 });
    expect(wrong?.message).toBe("amount_mismatch");
    for (const _ of [0, 1]) expect((await admin.rpc("confirm_order_payment", { p_order: order.id, p_payment_ref: "mp-1", p_amount: 16000 })).error).toBeNull();
    const after = await snap(cami, ev.id);
    expect(after.bar_orders.find((o) => o.id === order.id)?.payment_status).toBe("paid");
    expect(after.event_attendees.find((a) => a.user_id === cami.id)?.total_spent).toBe(8000 + 16000);
    await act(mateo, C.advanceOrder(after.bar_orders.find((o) => o.id === order.id)!), ev.id);
    // Un pedido sin pagar se puede cancelar
    const extra = await act(cami, C.createBarOrder(ev.id, cami.id, [{ itemId: "agua", qty: 1 }], "fast_pickup"), ev.id);
    await act(cami, C.cancelUnpaidOrder(extra.id, cami.id), ev.id);
    expect((await snap(cami, ev.id)).bar_orders.some((o) => o.id === extra.id)).toBe(false);
    // La dueña ve su cuenta de cobro (sin tokens) por RPC
    await admin.from("brand_payment_accounts").upsert({ brand_id: brand.id, provider_user_id: "123", account_label: "NEON", live_mode: false, access_token_enc: "v1.x.y.z" });
    const mine = await snap(mateo, ev.id);
    expect(mine.brand_payment_accounts).toEqual([expect.objectContaining({ brand_id: brand.id, account_label: "NEON" })]);
    expect(Object.keys(mine.brand_payment_accounts[0])).not.toContain("access_token_enc");
    const { data: leaked } = await mateo.sb.from("brand_payment_accounts").select("*");
    expect(leaked ?? []).toHaveLength(0);
  });

  it("cuentas de la mesa: gastos, transferencias y alias solo dentro del Squad", async () => {
    const squadId = (await snap(sofi)).squads.find((q) => q.name === "Las Pibas Test")!.id;
    await act(sofi, C.addSquadExpense(squadId, sofi.id, { description: "Mesa", amount: 30000, participantIds: [sofi.id, cami.id] }));
    const s = await snap(cami);
    expect(await rejects(mateo, C.addSquadExpense(squadId, mateo.id, { description: "x", amount: 1, participantIds: [mateo.id] }), s.squad_expenses[0], s)).toMatchObject({ message: "not_member" });
    expect((await snap(mateo)).squad_expenses.some((e) => e.squad_id === squadId)).toBe(false); // RLS
    const { squadAccount } = await import("@/lib/engine/settle");
    expect(squadAccount(s, squadId, cami.id).iOwe).toEqual([{ from: cami.id, to: sofi.id, amount: 15000 }]);

    await act(sofi, C.setPayoutAlias(sofi.id, `sofi.${RUN}`.slice(0, 20)));
    expect((await snap(cami)).payout_aliases.find((a) => a.user_id === sofi.id)?.alias).toBe(`sofi.${RUN}`.slice(0, 20));
    expect((await snap(mateo)).payout_aliases.some((a) => a.user_id === sofi.id)).toBe(false);

    const t = await act(cami, C.recordSettlement(squadId, cami.id, sofi.id, 15000, "mercadopago"));
    const s2 = await snap(cami);
    expect(await rejects(cami, C.respondSettlement(t.id, cami.id, true), null, s2)).toMatchObject({ message: "forbidden" });
    await act(sofi, C.respondSettlement(t.id, sofi.id, true));
    const s3 = await snap(sofi);
    expect(s3.squad_settlements.find((x) => x.id === t.id)?.confirmed_at).toBeTruthy();
    expect(squadAccount(s3, squadId, sofi.id).settled).toBe(true);
  });

  it("gestión del evento: menú, expulsión con bloqueo, nueva edición y borrado seguro", async () => {
    const ev = (await snap(mateo)).events.find((e) => e.created_by === mateo.id && e.name === `Club ${RUN}`)!;
    // Menú: el dueño agota un ítem; el servidor no lo vende
    const gin = (await snap(mateo, ev.id)).bar_menu.find((i) => i.id === "gin")!;
    await act(mateo, C.upsertMenuItem(ev.id, { ...gin, is_available: false }), ev.id);
    const { error: soldOut } = await cami.sb.rpc("create_bar_order", { p_event: ev.id, p_items: [{ item_id: "gin", qty: 1 }], p_delivery: "fast_pickup" });
    expect(soldOut?.message).toBe("empty_order");
    const { error: notMgr } = await cami.sb.from("bar_menu_items").update({ price: 1 }).eq("event_id", ev.id).eq("id", "agua").select();
    expect((await snap(mateo, ev.id)).bar_menu.find((i) => i.id === "agua")?.price).not.toBe(1);
    void notMgr;
    // Expulsión con bloqueo: Cami sale y no puede volver a entrar
    const s = await snap(cami, ev.id);
    expect(await rejects(cami, C.removeAttendee(ev.id, mateo.id, true), { banned: true }, s)).toMatchObject({ message: "forbidden" });
    await act(mateo, C.removeAttendee(ev.id, cami.id, true, "prueba"), ev.id);
    expect((await snap(mateo, ev.id)).event_attendees.some((a) => a.event_id === ev.id && a.user_id === cami.id)).toBe(false);
    expect((await snap(mateo, ev.id)).event_bans.map((b) => b.user_id)).toContain(cami.id);
    const { error: banned } = await cami.sb.rpc("join_event", { p_code: ev.master_invite_code, p_mood: "just_dance" });
    expect(banned?.message).toBe("banned");
    await act(mateo, C.unbanAttendee(ev.id, cami.id), ev.id);
    expect((await cami.sb.rpc("join_event", { p_code: ev.master_invite_code, p_mood: "just_dance" })).error).toBeNull();
    // Un evento con gente (y cobros) no se borra; una edición nueva vacía sí
    const { error: keep } = await mateo.sb.from("events").delete().eq("id", ev.id);
    expect(keep?.message).toMatch(/event_has_(payments|attendees)/);
    const dup = await act(mateo, C.duplicateEvent(ev.id, new Date(Date.now() + 7 * 86_400_000).toISOString()), ev.id);
    const fresh = await snap(mateo, dup.event.id);
    expect(fresh.events.find((e) => e.id === dup.event.id)?.brand_id).toBe(ev.brand_id);
    expect(fresh.bar_menu.length).toBeGreaterThan(5);
    const { data: gone } = await sofi.sb.from("events").delete().eq("id", dup.event.id).select();
    expect(gone ?? []).toHaveLength(0); // RLS: solo quien lo creó
    await act(mateo, C.deleteEvent(dup.event.id), dup.event.id);
    const { data: left } = await admin.from("events").select("id").eq("id", dup.event.id);
    expect(left).toHaveLength(0);
  });

  it("RRPP y puerta: link propio, atribución, números sin datos personales y escáner", async () => {
    const ev = (await snap(mateo)).events.find((e) => e.created_by === mateo.id && e.name === `Club ${RUN}`)!;
    const sofiName = (await snap(sofi)).profiles.find((p) => p.id === sofi.id)!.username;
    await act(mateo, C.setStaffRole(ev.id, sofiName, "promoter"), ev.id);
    const link = await act(sofi, C.ensurePromoterLink(ev.id, sofi.id), ev.id);
    expect(link.code).toMatch(/^RP[A-Z0-9]{6}$/);
    await act(mateo, C.setPromoterCommission(link.id, 1000), ev.id);
    // Staff (dueño) entra por el link de Sofía → no queda atribuido a sí mismo; un nuevo asistente sí
    const newbie = await actor(admin, "newbie");
    await act(newbie, C.upsertProfile(newbie.id, { username: `nb.${RUN}`.slice(0, 20), full_name: "New Bie", birth_date: "1999-05-05", phone: phone(9) }), ev.id);
    const { error: joinErr } = await newbie.sb.rpc("join_event", { p_code: link.code.toLowerCase(), p_mood: "just_dance" });
    expect(joinErr).toBeNull();
    const { data: preview } = await createClient(URL!, ANON!, opts).rpc("resolve_access_code", { p_code: link.code });
    expect(preview).toMatchObject({ via: "master_link", event: { id: ev.id } });
    // El RRPP ve sus números (sin personas) y no ve datos del evento como staff
    const asRrpp = await snap(sofi, ev.id);
    expect(asRrpp.promoter_stats).toEqual([expect.objectContaining({ user_id: sofi.id, entries: 1, commission_per_entry: 1000 })]);
    const { data: pins } = await sofi.sb.from("map_pins").select("id").eq("event_id", ev.id);
    expect(pins ?? []).toHaveLength(0);
    const { data: codes } = await sofi.sb.from("event_invite_codes").select("id").eq("event_id", ev.id);
    expect(codes ?? []).toHaveLength(0);
    // Puerta: el dueño escanea el pase del nuevo asistente; un RRPP no puede escanear
    // v1.7: el pase es el QR dinámico (TOTP); el fijo se rechaza como captura.
    const { data: secrets } = await newbie.sb.rpc("my_qr_secrets", { p_event: ev.id });
    const passSecret = (secrets as { kind: string; secret: string }[]).find((x) => x.kind === "PASS")!.secret;
    const staticPass = `ROUGE:PASS:${ev.id}:${newbie.id}`;
    expect((await act(mateo, C.doorCheckIn(ev.id, staticPass), ev.id)).status).toBe("static_qr");
    const pass = dynamicQrValue(passSecret, "PASS", newbie.id);
    const { error: rrppDoor } = await sofi.sb.rpc("door_check_in", { p_event: ev.id, p_value: pass });
    expect(rrppDoor?.message).toBe("forbidden");
    const first = await act(mateo, C.doorCheckIn(ev.id, pass), ev.id);
    expect(first).toMatchObject({ status: "ok", kind: "pass", name: "New Bie" });
    expect((await act(mateo, C.doorCheckIn(ev.id, pass), ev.id)).status).toBe("already");
    expect((await act(mateo, C.doorCheckIn(ev.id, ev.master_invite_code), ev.id)).status).toBe("general_link");
    // Con escáner en uso, se liquida por ingreso confirmado
    const stats = (await snap(mateo, ev.id)).promoter_stats!;
    expect(stats.find((r) => r.user_id === sofi.id)).toMatchObject({ entries: 1, checked_in: 1, billable: 1, to_pay: 1000 });
  });

  it("verticales: evento corporativo con perfil profesional obligatorio y caras que no se cruzan", async () => {
    const start = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const ev = await act(staff, C.upsertEvent({ kind: "corporate", name: `Pyme ${RUN}`, starts_at: start, ends_at: new Date(Date.now() + 8 * 3_600_000).toISOString() }));
    expect(ev.kind).toBe("corporate");
    const code = ev.master_invite_code;
    // Sin perfil profesional el servidor rechaza (la regla local se saltea para probar join_event).
    const before = await snap(cami, ev.id);
    expect((await rejects(cami, C.joinEvent(cami.id, code, "pro_buying", ev.id, null), { eventId: ev.id }, before))?.message).toMatch(/persona_required/);
    // Mood de la noche en un evento corporativo: invalid_mood.
    const sofiPro = await act(sofi, C.upsertPersona(sofi.id, { kind: "corporate", label: "Trabajo", job_title: "Diseñadora", company: `Estudio ${RUN}`, looking_for: ["clients"], offering: ["software"] }), ev.id);
    const s0 = await snap(sofi, ev.id);
    expect((await rejects(sofi, C.joinEvent(sofi.id, code, "after_hunt", ev.id, sofiPro.id), { eventId: ev.id }, s0))?.message).toMatch(/invalid_mood/);
    await act(sofi, C.joinEvent(sofi.id, code, "pro_selling", ev.id, sofiPro.id), ev.id);
    // Mateo no está en el evento: no ve el perfil profesional de Sofía.
    expect((await snap(mateo, ev.id)).profile_personas.some((p) => p.id === sofiPro.id)).toBe(false);
    // Cami entra con su perfil profesional y ve a Sofía con su cara profesional (sin géneros de la noche).
    const camiPro = await act(cami, C.upsertPersona(cami.id, { kind: "corporate", label: "Pyme", company: `Textil ${RUN}`, looking_for: ["software"], offering: ["suppliers"] }), ev.id);
    await act(cami, C.joinEvent(cami.id, code, "pro_buying", ev.id, camiPro.id), ev.id);
    const camiState = await snap(cami, ev.id);
    const { faceOf } = await import("@/lib/engine/verticals");
    const face = faceOf(camiState, sofi.id, ev.id)!;
    expect(face.persona?.company).toBe(`Estudio ${RUN}`);
    expect(face.music_genres).toEqual([]);
    // El tipo de evento ya no se puede cambiar; el perfil en uso no se borra.
    const st = await snap(staff, ev.id);
    const asNight: RougeEvent = { ...ev, kind: "nightlife" };
    expect((await rejects(staff, C.upsertEvent(asNight), asNight, st))?.message).toMatch(/kind_locked/);
    expect((await rejects(sofi, C.deletePersona(sofi.id, sofiPro.id), undefined, s0))?.message).toMatch(/persona_in_use/);
  });

  it("privacidad v1.8: perfiles ajenos solo como tarjeta saneada y asistencia sin columnas privadas", async () => {
    // Por tabla, nadie lee perfiles ajenos (ni siquiera de su evento).
    const { data: others } = await cami.sb.from("profiles").select("id").neq("id", cami.id);
    expect(others ?? []).toEqual([]);
    // Tarjeta: Sofía y Cami comparten la fiesta con su Perfil principal → edad, nunca fecha ni teléfono.
    const { data: cards, error } = await cami.sb.rpc("profile_cards", { p_ids: [sofi.id] });
    expect(error).toBeNull();
    const card = (cards as Record<string, unknown>[])[0];
    expect(card).toBeTruthy();
    expect(card).not.toHaveProperty("birth_date");
    expect(card).not.toHaveProperty("phone_normalized");
    expect(typeof card.age).toBe("number");
    // Columnas privadas de la asistencia: cerradas por tabla.
    const priv = await cami.sb.from("event_attendees").select("total_spent").eq("event_id", EV);
    expect(priv.error).not.toBeNull();
    const own = await cami.sb.rpc("my_attendances");
    expect(own.error).toBeNull();
    // Ajustes de privacidad: solo los propios.
    await act(cami, C.updatePrivacySettings(cami.id, { pin_share_matches: false }));
    const { data: mineSettings } = await cami.sb.from("privacy_settings").select("*");
    expect((mineSettings as { user_id: string }[]).every((r) => r.user_id === cami.id)).toBe(true);
  });

  it("reuniones v1.8: pedir con sala, aceptar abre el chat y la sala queda ocupada", async () => {
    const start = new Date(Date.now() + 30 * 60_000).toISOString();
    const ev = await act(staff, C.upsertEvent({ kind: "corporate", name: `Ronda ${RUN}`, starts_at: start, ends_at: new Date(Date.now() + 6 * 3_600_000).toISOString() }));
    const room = await act(staff, C.upsertVenueSpot(ev.id, { name: "Sala 1", kind: "room", capacity: 1, coord_x: 70, coord_y: 60 }), ev.id);
    for (const a of [sofi, mateo]) {
      const persona = await act(a, C.upsertPersona(a.id, { kind: "corporate", label: "Trabajo", company: `${a.name} SA`, looking_for: ["clients"], offering: ["software"] }), ev.id);
      await act(a, C.joinEvent(a.id, ev.master_invite_code, "pro_networking", ev.id, persona.id), ev.id);
    }
    const at = new Date(Math.ceil((Date.now() + 60 * 60_000) / 900_000) * 900_000).toISOString();
    const req = await act(sofi, C.requestMeeting(ev.id, sofi.id, mateo.id, { topic: "Integración", startsAt: at, duration: 30, location: { kind: "spot", spotId: room.id } }), ev.id);
    expect(req.status).toBe("pending");
    // Cami no está en la reunión: no la ve.
    const { data: seen } = await cami.sb.from("meetings").select("id").eq("id", req.id);
    expect(seen ?? []).toEqual([]);
    const accepted = await act(mateo, C.respondMeeting(req.id, mateo.id, true), ev.id);
    expect(accepted.status).toBe("accepted");
    expect(accepted.connection_id).toBeTruthy();
    // Otra pareja no puede reservar la misma sala en ese horario.
    const st = await snap(staff, ev.id);
    const err = await rejects(staff, C.requestMeeting(ev.id, staff.id, mateo.id, { topic: "x", startsAt: at, duration: 15, location: { kind: "spot", spotId: room.id } }), accepted, st);
    expect(err?.message).toBeTruthy();
  });

  it("agenda v1.11: charlas por tabla, Mi Agenda con reemplazo, Q&A anónima sin autoría visible y encuesta en vivo", async () => {
    const start = new Date(Date.now() + 10 * 60_000).toISOString();
    const ev = await act(staff, C.upsertEvent({ kind: "corporate", name: `Summit ${RUN}`, starts_at: start, ends_at: new Date(Date.now() + 8 * 3_600_000).toISOString() }));
    for (const a of [sofi, mateo]) {
      const persona = await act(a, C.upsertPersona(a.id, { kind: "corporate", label: "Trabajo", company: `${a.name} SA`, looking_for: ["clients"], offering: ["software"] }), ev.id);
      await act(a, C.joinEvent(a.id, ev.master_invite_code, "pro_learning", ev.id, persona.id), ev.id);
    }
    const day = localParts(Date.now() + 60 * 60_000).day;
    const t = localParts(Math.ceil((Date.now() + 60 * 60_000) / 3_600_000) * 3_600_000).time;
    const later = (h: number) => `${String(Math.min(23, Number(t.slice(0, 2)) + h)).padStart(2, "0")}:${h === 0 ? "45" : "30"}`;
    if (t >= "22:00") return; // la ventana cruzaría la medianoche: se saltea en esa hora
    const a = await act(staff, C.upsertSession(ev.id, { title: "Keynote", track: "Tecnología & IA", room_name: "Auditorio", day, start_time: t, end_time: later(0) }), ev.id);
    const b = await act(staff, C.upsertSession(ev.id, { title: "Panel", track: "Liderazgo", room_name: "Sala B", day, start_time: t, end_time: later(1), capacity: 1 }), ev.id);
    // La misma sala en el mismo horario: rechazada por el trigger.
    const st0 = await snap(staff, ev.id);
    const clash = { ...a, id: crypto.randomUUID(), title: "Choca", track: "Liderazgo", room_name: "auditorio" };
    expect((await rejects(staff, C.upsertSession(ev.id, clash), clash, st0))?.message).toBe("room_busy");
    // El contador no se escribe por tabla.
    const { error: cheat } = await staff.sb.from("event_sessions").update({ enrolled_count: 99 }).eq("id", a.id);
    expect(cheat).toBeTruthy();
    // Mi Agenda: agendo A, después B reemplazando A; el cupo de B (1) deja afuera a Mateo.
    await act(sofi, C.enrollSession(sofi.id, a.id), ev.id);
    const swap = await act(sofi, C.enrollSession(sofi.id, b.id, [a.id]), ev.id);
    expect(swap.session.enrolled_count).toBe(1);
    const sofiState = await snap(sofi, ev.id);
    expect(sofiState.session_enrollments.map((e) => e.session_id)).toEqual([b.id]);
    expect(sofiState.event_sessions.find((x) => x.id === a.id)?.enrolled_count).toBe(0);
    const mateoState = await snap(mateo, ev.id);
    expect((await rejects(mateo, C.enrollSession(mateo.id, b.id), swap, mateoState))?.message).toBe("session_full");
    expect(mateoState.session_enrollments).toEqual([]); // no ve las inscripciones de Sofía
    // Q&A: cerrada hasta que la organización la pone en vivo; anónima sin autoría visible para otros.
    expect((await rejects(sofi, C.askQuestion(sofi.id, a.id, "¿Hay grabación?", true), sofiState.session_questions[0], sofiState))?.message).toBe("not_live");
    await act(staff, C.setSessionLive(ev.id, a.id, true), ev.id);
    const q = await act(sofi, C.askQuestion(sofi.id, a.id, "¿Hay grabación?", true), ev.id);
    expect(q).toMatchObject({ is_anonymous: true, author_label: null });
    const { data: authors } = await mateo.sb.from("session_question_authors").select("*");
    expect(authors ?? []).toEqual([]);
    expect(await act(mateo, C.toggleQuestionVote(mateo.id, q.id), ev.id)).toEqual({ voted: true, upvotes: 1 });
    expect((await snap(sofi, ev.id)).session_question_authors.map((x) => x.question_id)).toEqual([q.id]);
    // Moderación: Mateo no puede ocultar; la organización sí y deja de verla el público.
    expect((await rejects(mateo, C.moderateQuestion(ev.id, q.id, "hide"), q, mateoState))?.message).toBe("forbidden");
    await act(staff, C.moderateQuestion(ev.id, q.id, "hide"), ev.id);
    expect((await snap(mateo, ev.id)).session_questions).toEqual([]);
    // Encuesta: voto cambiable y totales del servidor.
    const poll = await act(staff, C.launchPoll(ev.id, a.id, "¿Sirvió?", ["Sí", "No"]), ev.id);
    await act(mateo, C.votePoll(mateo.id, poll.id, "o1"), ev.id);
    const after = await act(mateo, C.votePoll(mateo.id, poll.id, "o2"), ev.id);
    expect(after.results).toEqual({ o1: 0, o2: 1 });
  });

  it("storage: subo a mi carpeta, no a la de otra persona", async () => {
    const blob = new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" });
    const ok = await sofi.sb.storage.from("profile-media").upload(`${sofi.id}/test-${RUN}.webp`, blob, { contentType: "image/webp" });
    expect(ok.error).toBeNull();
    const bad = await sofi.sb.storage.from("profile-media").upload(`${cami.id}/hack-${RUN}.webp`, blob, { contentType: "image/webp" });
    expect(bad.error).not.toBeNull();
  });

  it("realtime: Cami recibe en vivo el mensaje del squad de Sofía", async () => {
    const squadId = (await snap(sofi)).squads[0].id;
    // El primer uso de Realtime en un stack recién creado inicializa la conexión del tenant con la base:
    // en vez de una espera fija, Sofía reintenta cada 2 s hasta que el mensaje llega en vivo.
    let timer: ReturnType<typeof setInterval> | undefined;
    const got = new Promise<number>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("timeout realtime")), 30_000);
      let sent = 0;
      const ch = cami.sb
        .channel(`it-${RUN}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
          if ((p.new as { content: string }).content.startsWith("realtime ok")) {
            clearTimeout(deadline);
            clearInterval(timer);
            void cami.sb.removeChannel(ch);
            resolve(sent);
          }
        })
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          const send = () => void act(sofi, C.sendMessage(sofi.id, { type: "squad", squadId }, { content: `realtime ok #${++sent}` }));
          setTimeout(send, 1000);
          timer = setInterval(send, 2000);
        });
    });
    const attempts = await got;
    expect(attempts).toBeGreaterThanOrEqual(1);
  }, 40_000);
});
