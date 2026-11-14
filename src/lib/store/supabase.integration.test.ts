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
import type { RougeState, UUID } from "@/lib/types";
import { fetchRemoteState } from "@/lib/supabase/sync";
import * as C from "./commands";
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
