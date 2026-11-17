import { describe, expect, it } from "vitest";
import { createSeedState, DEMO_IDS } from "@/lib/mock/seed";
import type { RougeState } from "@/lib/types";
import { credentialSecret, dynamicQrValue, myCredentialSecret, QR_STEP_MS, qrSecondsLeft, verifyDynamicQr } from "./qr";
import { doorCheckIn, doorSettleLate, lateFreeFor } from "./door";
import { redeemDynamicQr } from "./scan";
import { buildRoster, codeHash, offlineDoorCheck, reconcileOffline, searchRoster } from "./doorOffline";

const NOW = Date.parse("2026-11-14T03:00:00.000Z");
const EV = DEMO_IDS.event;
const seed = () => createSeedState(NOW);
const secretOf = (s: RougeState) => s.events[0].qr_secret!;
const live = (s: RougeState, kind: "PASS" | "PERK" | "ORDER", ref: string, at = NOW) => dynamicQrValue(credentialSecret(secretOf(s), kind, ref), kind, ref, at);

describe("QR dinámico TOTP (rota cada 20 s)", () => {
  it("cambia de un ciclo al siguiente y avisa cuánto le queda", () => {
    const s = seed();
    const a = live(s, "PASS", DEMO_IDS.me, NOW);
    const b = live(s, "PASS", DEMO_IDS.me, NOW + QR_STEP_MS);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^ROUGE:T1:PASS:/);
    expect(qrSecondsLeft(Math.floor(NOW / QR_STEP_MS) * QR_STEP_MS + 5_000)).toBe(15);
  });

  it("acepta ±1 ciclo de desfasaje de reloj y rechaza capturas más viejas", () => {
    const s = seed();
    const v = live(s, "PASS", DEMO_IDS.me, NOW);
    expect(verifyDynamicQr(v, secretOf(s), NOW).ok).toBe(true);
    expect(verifyDynamicQr(v, secretOf(s), NOW + QR_STEP_MS).ok).toBe(true);
    expect(verifyDynamicQr(v, secretOf(s), NOW - QR_STEP_MS).ok).toBe(true);
    expect(verifyDynamicQr(v, secretOf(s), NOW + 2 * QR_STEP_MS)).toEqual({ ok: false, reason: "expired" });
  });

  it("no se puede fabricar: otra persona, otro secreto o una firma tocada fallan", () => {
    const s = seed();
    const v = live(s, "PASS", DEMO_IDS.me, NOW);
    expect(verifyDynamicQr(v.replace(DEMO_IDS.me, DEMO_IDS.organizer), secretOf(s), NOW)).toEqual({ ok: false, reason: "forged" });
    expect(verifyDynamicQr(v, "otro-secreto", NOW)).toEqual({ ok: false, reason: "forged" });
    expect(verifyDynamicQr(v.slice(0, -1) + (v.endsWith("A") ? "B" : "A"), secretOf(s), NOW).ok).toBe(false);
    expect(verifyDynamicQr("ROUGE:PASS:x:y", secretOf(s), NOW)).toEqual({ ok: false, reason: "format" });
  });

  it("el teléfono usa el secreto de SU credencial (el del servidor si lo mandó)", () => {
    const s = seed();
    expect(myCredentialSecret(s, EV, "PASS", DEMO_IDS.me)).toBe(credentialSecret(secretOf(s), "PASS", DEMO_IDS.me));
    const remote = { ...s, events: s.events.map((e) => ({ ...e, qr_secret: null })), qr_secrets: [{ event_id: EV, kind: "PASS" as const, ref: DEMO_IDS.me, secret: "abc" }] };
    expect(myCredentialSecret(remote, EV, "PASS", DEMO_IDS.me)).toBe("abc");
    expect(myCredentialSecret(remote, EV, "PASS", DEMO_IDS.organizer)).toBeNull();
  });
});

describe("escaneo idempotente en la puerta (dos terminales)", () => {
  it("la primera terminal deja pasar; la segunda ve 'ya entró' con la hora y la terminal", () => {
    const s = seed();
    const joaco = "00000000-0000-4000-8000-000000000008";
    const v = live(s, "PASS", joaco);
    const first = doorCheckIn(s, EV, v, NOW, { terminal: "Puerta 1" });
    expect(first.data).toMatchObject({ status: "ok", terminal: "Puerta 1" });
    const second = doorCheckIn(first.state, EV, v, NOW + 500, { terminal: "Puerta 2" });
    expect(second.data).toMatchObject({ status: "already", terminal: "Puerta 1", checked_in_at: new Date(NOW).toISOString() });
  });

  it("una captura vencida o el pase fijo se rechazan", () => {
    const s = seed();
    expect(doorCheckIn(s, EV, live(s, "PASS", DEMO_IDS.me, NOW - 3 * QR_STEP_MS), NOW).data.status).toBe("expired_qr");
    expect(doorCheckIn(s, EV, `ROUGE:PASS:${EV}:${DEMO_IDS.me}`, NOW).data.status).toBe("static_qr");
  });
});

describe("listas free con conversión tardía", () => {
  const listed = (s: RougeState, listId: string) => s.event_invite_codes.find((c) => c.list_id === listId && !c.checked_in_at)!;
  it("antes del horario entra free; después queda 'fuera de horario' con el monto y no entra hasta cobrar", () => {
    const s = seed();
    const freeList = s.ticket_lists.find((l) => +new Date(l.free_until!) > NOW)!;
    const lateList = s.ticket_lists.find((l) => +new Date(l.free_until!) < NOW)!;
    expect(doorCheckIn(s, EV, listed(s, freeList.id).code, NOW).data.status).toBe("ok");
    const code = listed(s, lateList.id);
    const r = doorCheckIn(s, EV, code.code, NOW, { terminal: "Puerta 1" });
    expect(r.data).toMatchObject({ status: "late_free", late: { code_id: code.id, price: lateList.late_price, list: lateList.name } });
    expect(r.state.event_invite_codes.find((c) => c.id === code.id)?.checked_in_at).toBeNull();
    // Cobrado en puerta → entra en el mismo paso; un segundo cobro no duplica
    const paid = doorSettleLate(s, EV, code.id, "cash", NOW, { terminal: "Puerta 1" });
    if (!paid.ok) throw new Error(paid.error);
    expect(paid.data.status).toBe("ok");
    const row = paid.state.event_invite_codes.find((c) => c.id === code.id)!;
    expect(row).toMatchObject({ late_payment_method: "cash", checked_in_terminal: "Puerta 1" });
    expect(lateFreeFor(paid.state, row, NOW)).toBeNull();
    const again = doorSettleLate(paid.state, EV, code.id, "mercadopago", NOW + 1000, { terminal: "Puerta 2" });
    expect(again.ok && again.data).toMatchObject({ status: "already", terminal: "Puerta 1" });
  });

  it("no se cobra diferencial a una entrada que todavía está en horario free", () => {
    const s = seed();
    const freeList = s.ticket_lists.find((l) => +new Date(l.free_until!) > NOW)!;
    expect(doorSettleLate(s, EV, listed(s, freeList.id).id, "cash", NOW).ok).toBe(false);
  });
});

describe("canje dinámico en la barra", () => {
  it("un perk se canjea UNA vez con el QR en vivo; el segundo escaneo avisa la hora", () => {
    const s = seed();
    const perk = s.user_perks_qrs.find((p) => p.status === "available" && p.event_id === EV)!;
    const v = live(s, "PERK", perk.id);
    const r = redeemDynamicQr(s, EV, v, NOW);
    expect(r.ok && r.data.kind).toBe("PERK");
    const twice = redeemDynamicQr((r as { state: RougeState }).state, EV, v, NOW + 1000);
    expect(twice).toMatchObject({ ok: false, error: expect.stringContaining("ya fue canjeado a las") });
    expect(redeemDynamicQr(s, EV, perk.qr_code_string, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("estático") });
  });

  it("un voucher de pedido listo se entrega con su QR en vivo", () => {
    let s = seed();
    const o = s.bar_orders.find((x) => x.pickup_code && x.event_id === EV)!;
    s = { ...s, bar_orders: s.bar_orders.map((x) => (x.id === o.id ? { ...x, status: "ready_qr", payment_status: "paid" } : x)) };
    const r = redeemDynamicQr(s, EV, live(s, "ORDER", o.id), NOW);
    expect(r.ok && r.data.kind === "ORDER" && r.data.order.status).toBe("completed");
  });
});

describe("puerta sin conexión (padrón cifrado)", () => {
  it("valida contra el padrón, marca quemado y detecta el doble uso localmente", () => {
    const s = seed();
    const roster = buildRoster(s, EV, NOW);
    expect(roster.codes.every((c) => /^[0-9a-f]{64}$/.test(c.hash))).toBe(true);
    expect(JSON.stringify(roster.codes)).not.toContain(s.event_invite_codes[10].code); // solo hashes
    const code = s.event_invite_codes.find((c) => !c.checked_in_at && !c.list_id && !c.revoked_at)!;
    const a = offlineDoorCheck(roster, code.code, NOW, "Puerta 1");
    expect(a.result.status).toBe("ok");
    expect(offlineDoorCheck(a.roster, code.code, NOW + 1000).result.status).toBe("already");
    const joaco = "00000000-0000-4000-8000-000000000008";
    expect(offlineDoorCheck(roster, live(s, "PASS", joaco), NOW).result.status).toBe("ok");
    expect(offlineDoorCheck(roster, "BRESH26", NOW).result.status).toBe("general_link");
    expect(roster.codes.find((c) => c.hash === codeHash(EV, code.code))).toBeTruthy();
  });

  it("al volver la conexión aplica la cola; si otra terminal ya lo usó, es un conflicto", () => {
    const s = seed();
    const free = s.event_invite_codes.find((c) => !c.checked_in_at && !c.list_id && !c.revoked_at)!;
    const used = s.event_invite_codes.find((c) => c.checked_in_at)!;
    const at = new Date(NOW).toISOString();
    const r = reconcileOffline(s, EV, [
      { kind: "code", ref: free.code, at, terminal: "Puerta 3" },
      { kind: "code", ref: used.code, at, terminal: "Puerta 3" },
    ]);
    expect(r.data.applied).toBe(1);
    expect(r.data.conflicts).toEqual([expect.objectContaining({ kind: "code", ref: used.code, terminal: used.checked_in_terminal })]);
    expect(r.state.event_invite_codes.find((c) => c.id === free.id)).toMatchObject({ checked_in_at: at, checked_in_terminal: "Puerta 3" });
  });

  it("búsqueda manual por nombre, DNI o email (sin batería)", () => {
    const roster = buildRoster(seed(), EV, NOW);
    expect(searchRoster(roster, "agustina")[0]?.title).toBe("Agustina Molina");
    expect(searchRoster(roster, "38451220")[0]?.title).toBe("Agustina Molina");
    expect(searchRoster(roster, "fede.sosa@mail")[0]?.title).toBe("Federico Sosa");
    expect(searchRoster(roster, "lucia")[0]?.title).toBe("Lucía Fernández");
    expect(searchRoster(roster, "x")).toEqual([]);
  });
});
