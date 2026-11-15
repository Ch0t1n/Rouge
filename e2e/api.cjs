// API v1 (HTTP real) · lo que hace una ticketera: clave, códigos por entrada, estado, check-in, anulación, QR.
// Requiere la app compilada contra un Supabase de prueba y corriendo con SUPABASE_SERVICE_ROLE_KEY.
const { createClient } = require("@supabase/supabase-js");
const { BASE, SUPABASE_URL, ANON, SERVICE } = require("./env.cjs");

const EV_SLUG = "bresh-sabado"; // evento de supabase/seed.sql
const RUN = Date.now().toString(36);
const log = (...a) => console.log(...a);
const assert = (c, m) => {
  if (!c) throw new Error("✘ " + m);
  log("✔ " + m);
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function call(method, path, { key, body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, type, json: type.includes("json") ? await res.json() : null, buf: type.includes("json") ? null : Buffer.from(await res.arrayBuffer()) };
}

async function user(admin, name) {
  const email = `${name}.${RUN}@rouge.test`;
  const password = `Rouge-${RUN}-pass!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const sb = createClient(SUPABASE_URL, ANON, opts);
  await sb.auth.signInWithPassword({ email, password });
  return { id: data.user.id, sb };
}

(async () => {
  if (!ANON || !SERVICE) throw new Error("Faltan SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE, opts);
  const { data: ev } = await admin.from("events").select("id").eq("slug", EV_SLUG).single();

  // Organizadora con rol de producción en el evento crea la clave desde su sesión
  const org = await user(admin, "ticketera");
  await admin.from("profiles").insert({ id: org.id, username: `tk.${RUN}`.slice(0, 20), full_name: "Ticketera", birth_date: "1990-01-01" });
  await admin.from("event_staff").insert({ event_id: ev.id, user_id: org.id, role: "manager" });
  const { data: k, error: kErr } = await org.sb.rpc("create_api_key", { p_name: "E2E Ticketera", p_event: ev.id });
  if (kErr) throw kErr;
  const KEY = k.key;

  let r = await call("GET", "");
  assert(r.status === 200 && r.json.name === "ROUGE API", "GET /api/v1");
  r = await call("GET", "/events");
  assert(r.status === 401 && r.json.error.code === "missing_api_key", "sin clave → 401 missing_api_key");
  r = await call("GET", "/events", { key: `rk_live_${"0".repeat(10)}_${"0".repeat(48)}` });
  assert(r.status === 401 && r.json.error.code === "invalid_api_key", "clave inexistente → 401 invalid_api_key");

  r = await call("GET", "/events", { key: KEY });
  const e = r.json.data.find((x) => x.slug === EV_SLUG);
  assert(r.status === 200 && r.json.data.length === 1 && e && e.master_link.endsWith(`/join/${EV_SLUG}`), "GET /events → solo el evento de la clave, con link maestro");
  const before = e.codes;

  const tickets = [{ external_ref: `ORD-${RUN}-1`, label: "VIP" }, { external_ref: `ORD-${RUN}-2` }, { external_ref: `ORD-${RUN}-3` }];
  r = await call("POST", `/events/${EV_SLUG}/codes`, { key: KEY, body: { tickets, label: "General" } });
  assert(r.status === 201 && r.json.created === 3 && r.json.existing === 0, "POST por entrada (slug) → 201, 3 creados");
  const codes = r.json.data;
  assert(codes.every((c) => /^[A-HJ-NP-Z2-9]{10}$/.test(c.code) && c.status === "unused" && c.join_url === `${BASE}/join/${c.code}` && c.qr_url === `${BASE}/api/v1/qr/${c.code}`), "cada código trae join_url y qr_url");
  assert(codes.find((c) => c.external_ref === tickets[0].external_ref).label === "VIP" && codes.find((c) => c.external_ref === tickets[1].external_ref).label === "General", "etiqueta por entrada y por defecto");

  r = await call("POST", `/events/${ev.id}/codes`, { key: KEY, body: { tickets } });
  assert(r.status === 200 && r.json.created === 0 && r.json.data.map((c) => c.code).sort().join() === codes.map((c) => c.code).sort().join(), "reintento idempotente (por id) → 200, mismos códigos");

  const COURTESY = `Cortesía ${RUN}`;
  r = await call("POST", `/events/${EV_SLUG}/codes`, { key: KEY, body: { count: 3, label: COURTESY } });
  assert(r.status === 201 && r.json.created === 3 && r.json.data.every((c) => c.label === COURTESY && c.external_ref === null), "POST por cantidad → 3 cortesías");

  for (const [body, why] of [[{}, "vacío"], [{ count: 1001 }, "más de 1000"], [{ tickets: [{ external_ref: "A" }, { external_ref: "A" }] }, "external_ref repetido"], [{ count: 1, tickets: [] }, "count y tickets juntos"]]) {
    r = await call("POST", `/events/${EV_SLUG}/codes`, { key: KEY, body });
    assert(r.status === 422 && r.json.error.code === "validation_error", `body inválido (${why}) → 422`);
  }

  // Paginación
  const lbl = encodeURIComponent(COURTESY);
  const p1 = await call("GET", `/events/${EV_SLUG}/codes?limit=2&label=${lbl}`, { key: KEY });
  const p2 = await call("GET", `/events/${EV_SLUG}/codes?limit=2&label=${lbl}&cursor=${p1.json.next_cursor}`, { key: KEY });
  assert(p1.json.data.length === 2 && p1.json.next_cursor && p2.json.data.length === 1 && !p2.json.next_cursor, "listado paginado con cursor (2 + 1)");
  r = await call("GET", `/events/${EV_SLUG}/codes?external_ref=${encodeURIComponent(tickets[2].external_ref)}`, { key: KEY });
  const third = codes.find((c) => c.external_ref === tickets[2].external_ref);
  assert(r.json.data.length === 1 && r.json.data[0].code === third.code, "buscar por external_ref");

  // Check-in: un comprador entra con el código de su entrada
  const since = new Date(Date.now() - 1000).toISOString();
  const buyer = await user(admin, "comprador");
  await admin.from("profiles").insert({ id: buyer.id, username: `cp.${RUN}`.slice(0, 20), full_name: "Comprador", birth_date: "1995-05-05" });
  const used = codes.find((c) => c.external_ref === tickets[0].external_ref);
  const { error: jErr } = await buyer.sb.rpc("join_event", { p_code: used.code.toLowerCase(), p_mood: "with_friends" });
  if (jErr) throw jErr;
  r = await call("GET", `/events/${EV_SLUG}/codes/${used.code}`, { key: KEY });
  assert(r.status === 200 && r.json.data.status === "used" && r.json.data.used_at, "GET código → used (check-in)");
  r = await call("GET", `/events/${EV_SLUG}/codes?status=used&used_since=${encodeURIComponent(since)}`, { key: KEY });
  assert(r.json.data.some((c) => c.code === used.code), "sincronizar check-ins con status=used&used_since");

  // Reembolso
  const refund = codes.find((c) => c.external_ref === tickets[1].external_ref);
  r = await call("DELETE", `/events/${EV_SLUG}/codes/${refund.code}`, { key: KEY });
  assert(r.status === 200 && r.json.data.status === "revoked", "DELETE → anulado");
  r = await call("DELETE", `/events/${EV_SLUG}/codes/${refund.code}`, { key: KEY });
  assert(r.status === 200 && r.json.data.status === "revoked", "DELETE repetido → idempotente");
  r = await call("DELETE", `/events/${EV_SLUG}/codes/${used.code}`, { key: KEY });
  assert(r.status === 409 && r.json.error.code === "code_already_used", "anular un código usado → 409");
  const late = await user(admin, "tarde");
  await admin.from("profiles").insert({ id: late.id, username: `tl.${RUN}`.slice(0, 20), full_name: "Tarde", birth_date: "1995-05-05" });
  const { error: rErr } = await late.sb.rpc("join_event", { p_code: refund.code, p_mood: "with_friends" });
  assert(rErr?.message === "invalid_code", "el código anulado ya no sirve para entrar");
  r = await call("GET", `/events/${EV_SLUG}/codes/NOEXISTE99`, { key: KEY });
  assert(r.status === 404 && r.json.error.code === "code_not_found", "código inexistente → 404");

  // Otro evento (fuera del alcance de la clave)
  const other = await user(admin, "otraorg");
  await admin.from("profiles").insert({ id: other.id, username: `ot.${RUN}`.slice(0, 20), full_name: "Otra", birth_date: "1990-01-01" });
  const start = new Date(Date.now() + 86400000);
  const { data: otherEv } = await admin.from("events").insert({ slug: `otra-${RUN}`, name: "Otra fiesta", starts_at: start.toISOString(), ends_at: new Date(+start + 6 * 3600000).toISOString(), lobby_opens_at: new Date(+start - 3600000).toISOString(), lobby_expires_at: new Date(+start + 8 * 3600000).toISOString(), master_invite_code: `OT${RUN}`.toUpperCase(), created_by: other.id }).select("id").single();
  r = await call("POST", `/events/${otherEv.id}/codes`, { key: KEY, body: { count: 1 } });
  assert(r.status === 404 && r.json.error.code === "event_not_found", "evento de otro organizador → 404");

  // QR para el mail de la entrada
  r = await call("GET", `/qr/${third.code}`);
  assert(r.status === 200 && r.type === "image/png" && r.buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "QR en PNG (para clientes de mail)");
  r = await call("GET", `/qr/${third.code}?format=svg&size=256`);
  assert(r.status === 200 && r.type.startsWith("image/svg+xml") && r.buf.toString().includes("<svg"), "QR en SVG");

  // Contadores y especificación
  r = await call("GET", "/events", { key: KEY });
  const after = r.json.data.find((x) => x.slug === EV_SLUG).codes;
  assert(after.total === before.total + 6 && after.revoked === before.revoked + 1 && after.used === before.used + 1, "contadores del evento actualizados");
  r = await call("GET", "/openapi.json");
  assert(r.status === 200 && r.json.openapi === "3.1.0" && r.json.servers[0].url === `${BASE}/api/v1`, "especificación OpenAPI");

  // Clave revocada y organizadora fuera del equipo
  await org.sb.rpc("revoke_api_key", { p_id: k.id });
  r = await call("GET", "/events", { key: KEY });
  assert(r.status === 401 && r.json.error.code === "invalid_api_key", "clave revocada → 401");
  const { data: k2 } = await org.sb.rpc("create_api_key", { p_name: "E2E 2", p_event: ev.id });
  await admin.from("event_staff").delete().eq("user_id", org.id).eq("event_id", ev.id);
  r = await call("POST", `/events/${EV_SLUG}/codes`, { key: k2.key, body: { count: 1 } });
  assert(r.status === 404, "si quien creó la clave sale del equipo, la clave pierde el evento");

  log("errores: ninguno");
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
