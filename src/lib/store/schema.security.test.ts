/**
 * Seguridad del esquema SQL REAL (supabase/schema.sql) sin Supabase: se carga en PGlite (Postgres embebido)
 * con stubs mínimos de auth/storage y se intenta romper RLS como usuarios distintos y como anónimo.
 * Cada caso es un ataque concreto que el esquema tiene que frenar (o un flujo legítimo que no puede romper).
 *
 * Complementa a supabase.integration.test.ts (stack real). Si cambiás schema.sql, este test tiene que pasar.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

const SCHEMA = readFileSync(path.resolve(__dirname, "../../../supabase/schema.sql"), "utf8");

/** Lo mínimo de Supabase que usa el esquema: roles, auth.uid(), storage y la publicación de Realtime. */
const SUPABASE_STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to public;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant usage on schema storage to anon, authenticated; grant all on storage.objects, storage.buckets to anon, authenticated;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`;

type Q = { ok: true; rows: Record<string, unknown>[] } | { ok: false; err: string };
const results: { label: string; pass: boolean; detail: string }[] = [];

describe("schema.sql: RLS y RPCs resisten ataques (PGlite)", () => {
  beforeAll(async () => {
    const db = new PGlite({ extensions: { citext, pgcrypto } });
    await db.exec("create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists citext with schema extensions;");
    await db.exec(SUPABASE_STUBS);
    await db.exec(SCHEMA);
    await db.exec(SCHEMA); // idempotente: se puede volver a correr sobre una base existente

    const U: Record<string, string> = { O: "00000000-0000-0000-0000-00000000000a", A: "00000000-0000-0000-0000-00000000000b", B: "00000000-0000-0000-0000-00000000000c", C: "00000000-0000-0000-0000-00000000000d" };
    const su = async (sql: string, p: unknown[] = []) => {
      await db.exec("reset role");
      return (await db.query<Record<string, unknown>>(sql, p)).rows;
    };
    const as = async (who: string | null, sql: string, p: unknown[] = []): Promise<Q> => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.headers', $2, false)", [who ? U[who] : "", JSON.stringify({ "x-forwarded-for": "9.9.9.9" })]);
      await db.exec(who ? "set role authenticated" : "set role anon");
      try {
        return { ok: true, rows: (await db.query<Record<string, unknown>>(sql, p)).rows };
      } catch (e) {
        return { ok: false, err: (e as Error).message };
      } finally {
        await db.exec("reset role");
      }
    };
    const check = (label: string, pass: boolean, detail = "") => results.push({ label, pass, detail });
    const denied = (r: Q) => !r.ok || r.rows.length === 0;
    const rows = (r: Q) => (r.ok ? r.rows : []);
    const err = (r: Q) => (r.ok ? "" : r.err);

    for (const [k, id] of Object.entries(U)) {
      await su("insert into auth.users (id, email) values ($1, $2)", [id, `${k}@x.test`]);
      await su(`insert into public.profiles (id, username, full_name, birth_date, phone_normalized, music_genres) values ($1, $2, $3, '1995-01-01', $4, '{Techno}')`, [id, `user_${k.toLowerCase()}`, `Nombre ${k}`, `+54911000000${Object.keys(U).indexOf(k)}`]);
    }
    await su(`insert into public.events (id, slug, name, starts_at, ends_at, lobby_opens_at, lobby_expires_at, created_by)
      values ('11111111-1111-1111-1111-111111111111', 'fiesta-test', 'Fiesta', now() + interval '1 hour', now() + interval '5 hours', now() - interval '1 hour', now() + interval '6 hours', $1)`, [U.O]);
    const EV = "11111111-1111-1111-1111-111111111111";
    await su(`insert into public.bar_menu_items (id, event_id, name, category, price) values ('gin', $1, 'Gin', 'trago', 5000)`, [EV]);
    for (const w of ["A", "B", "C"]) { const r = await as(w, "select public.join_event('fiesta-test', 'open_to_meet')"); check(`${w} entra por slug`, r.ok, err(r)); }

    // ── Helpers privados: no hay versión pública
    let r: Q = await as("C", `select public.is_blocked($1, $2)`, [U.A, U.B]);
    check("is_blocked ya no existe en public (no se puede consultar quién bloqueó a quién)", !r.ok && /does not exist/.test(err(r)), err(r));
    r = await as("C", `select public.is_match($1, $2, $3)`, [EV, U.A, U.B]);
    check("is_match ya no existe en public", !r.ok, err(r));
    r = await as(null, `select private.is_blocked($1, $2)`, [U.A, U.B]);
    check("anon no puede usar el schema private", !r.ok, err(r));
    r = await as(null, `select * from public.event_grid($1)`, [EV]);
    check("anon no ejecuta RPCs (EXECUTE sacado a PUBLIC)", !r.ok && /permission denied/.test(err(r)), err(r));
    r = await as(null, `select public.resolve_access_code('fiesta-test') as x`);
    check("anon sí puede ver la vista previa de /join", r.ok && (rows(r)[0]?.x as { event?: { slug?: string } } | null)?.event?.slug === "fiesta-test", err(r));
    r = await as(null, `select * from public.profiles`);
    check("anon no lee perfiles", denied(r));

    // ── Conexión A→B, match
    r = await as("A", `select (public.send_connection($1, $2)).id`, [EV, U.B]);
    check("A conecta con B", r.ok, err(r));
    const connId = rows(r)[0]?.id;
    r = await as("B", `update public.connections set status = 'pending', responded_at = now() where id = $1 returning id`, [connId]);
    check("el receptor no puede dejar la solicitud en un estado raro", denied(r), JSON.stringify(r));
    r = await as("B", `update public.connections set receiver_id = $2 where id = $1 returning id`, [connId, U.C]);
    check("el receptor no puede cambiar el destinatario", denied(r));
    r = await as("B", `update public.connections set status = 'accepted', responded_at = now() where id = $1 returning id`, [connId]);
    check("B acepta (match)", r.ok && rows(r).length === 1, err(r));

    // ── Mensajes
    r = await as("A", `insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content, media_url)
      values ($1, 'direct', $2, $3, 'image', '', 'https://tracker.evil.com/pixel.gif')`, [EV, connId, U.A]);
    check("foto de chat con URL externa (píxel de rastreo) → rechazada", !r.ok, "insertó");
    r = await as("A", `insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content, media_url)
      values ($1, 'direct', $2, $3, 'image', '', $4)`, [EV, connId, U.A, `https://proj.supabase.co/storage/v1/object/sign/chat-media/${U.B}/x.webp?token=t`]);
    check("foto de la carpeta de OTRO usuario → rechazada", !r.ok);
    const myPhoto = `https://proj.supabase.co/storage/v1/object/sign/chat-media/${U.A}/chat-1.webp?token=t`;
    r = await as("A", `insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content, media_url)
      values ($1, 'direct', $2, $3, 'image', '', $4)`, [EV, connId, U.A, myPhoto]);
    check("foto propia del Storage → ok", r.ok, err(r));
    r = await as("A", `insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content, created_at)
      values ($1, 'direct', $2, $3, 'text', 'hola', '2020-01-01')`, [EV, connId, U.A]);
    check("no se puede falsificar created_at", !r.ok);
    r = await as("A", `insert into public.messages (event_id, conversation_type, connection_id, sender_id, message_type, content)
      values ($1, 'direct', $2, $3, 'system_alert', '🚨 falso')`, [EV, connId, U.A]);
    check("no se puede falsificar una alerta del sistema", !r.ok);
    r = await as("C", `select * from public.messages`);
    check("un tercero no ve el chat", denied(r));

    // ── Storage de chat
    await su(`insert into storage.objects (bucket_id, name, owner) values ('chat-media', $1, $2), ('chat-media', $3, $2)`, [`${U.A}/chat-1.webp`, U.A, `${U.A}/chat-2.webp`]);
    r = await as("B", `select name from storage.objects where bucket_id = 'chat-media'`);
    check("B ve solo la foto que A le mandó (no las demás de A)", r.ok && rows(r).length === 1 && String(rows(r)[0]?.name).endsWith("chat-1.webp"), JSON.stringify(r));
    r = await as("C", `select name from storage.objects where bucket_id = 'chat-media'`);
    check("un tercero no puede listar ni firmar fotos de chat ajenas", denied(r), JSON.stringify(r));

    // ── Grilla
    await as("C", `update public.event_attendees set last_active_at = now() + interval '10 years' where user_id = auth.uid()`);
    const la = await su(`select last_active_at <= now() as ok from public.event_attendees where user_id = $1`, [U.C]);
    check("last_active_at en el futuro se recorta a ahora (no infla el ranking)", la[0]?.ok === true);
    r = await as("C", `update public.event_attendees set total_spent = 999999 where user_id = auth.uid() returning id`);
    check("nadie se suma gasto a mano", denied(r));

    // ── Squads
    r = await as("A", `select (public.create_squad($1, 'Pibas')).invite_code as code`, [EV]);
    check("A crea squad con código largo (SQ- + 10 hex)", r.ok && /^SQ-[0-9A-F]{10}$/.test(String(rows(r)[0]?.code)), JSON.stringify(r));
    const sq = (await su(`select id from public.squads limit 1`))[0].id;
    r = await as("A", `update public.squads set invite_code = 'FIESTA-TEST' where id = $1 returning id`, [sq]);
    check("miembro no puede cambiar el código de invitación", !r.ok);
    r = await as("A", `update public.squads set name = 'Las Pibas' where id = $1 returning id`, [sq]);
    check("miembro sí puede renombrar", r.ok && rows(r).length === 1, err(r));

    // ── Pines
    r = await as("A", `insert into public.map_pins (event_id, user_id, coord_x, coord_y, is_rescue_alert) values ($1, auth.uid(), 10, 10, true)`, [EV]);
    check("insert directo de pin (rescate falso / sin límites) → rechazado", !r.ok);
    r = await as("A", `select (public.drop_pin($1, 20, 20, repeat('x', 500), true, array[$2]::uuid[], 'acá')).sector_name as s`, [EV, U.C]);
    check("drop_pin recorta el sector y filtra no-matches", r.ok && String(rows(r)[0]?.s).length === 40, err(r));
    const shared = (await su(`select shared_match_ids from public.map_pins where user_id = $1`, [U.A]))[0].shared_match_ids;
    check("el pin NO se comparte con quien no es match", (shared as unknown[]).length === 0, JSON.stringify(shared));

    // ── Blasts
    r = await as("O", `select public.send_blast($1, 'Promo', 'Vení', '{"kind":"all"}', 'Ver', 'javascript:alert(1)')`, [EV]);
    check("blast con link javascript: → rechazado", !r.ok && /invalid_cta_link/.test(err(r)), err(r));
    r = await as("O", `select public.send_blast($1, 'Promo', 'Vení', '{"kind":"all"}', 'Ver', '/\\evil.com')`, [EV]);
    check("blast con link /\\\\evil.com → rechazado", !r.ok);
    r = await as("O", `select public.send_blast($1, 'Promo', 'Vení', '{"kind":"all"}', 'Ver', '/bar') as n`, [EV]);
    check("blast con ruta interna → ok", r.ok && rows(r)[0].n === 3, JSON.stringify(r));
    r = await as("O", `select public.send_blast($1, 'Promo 2', 'Solo top', '{"kind":"top_spenders","limit":1}') as n`, [EV]);
    const b2 = (await su(`select id from public.event_blasts where title = 'Promo 2'`))[0]?.id;
    const b1 = (await su(`select id from public.event_blasts where title = 'Promo'`))[0].id;
    const notMine = (await su(`select d.blast_id from public.blast_deliveries d where d.blast_id = $1 and d.user_id <> $2 limit 1`, [b2, U.C]));
    r = await as("C", `update public.blast_deliveries set blast_id = $1 where user_id = auth.uid() and blast_id = $2 returning blast_id`, [b2, b1]);
    check("no se puede reapuntar una entrega para leer blasts ajenos", !r.ok, JSON.stringify(r));
    r = await as("C", `update public.blast_deliveries set seen_at = now() where user_id = auth.uid() returning blast_id`);
    check("marcar como visto sigue funcionando", r.ok && rows(r).length >= 1, err(r));

    // ── Barra y QRs
    r = await as("A", `select (public.create_bar_order($1, '[{"item_id":"gin","qty":1}]', 'fast_pickup')).id as id`, [EV]);
    check("A pide en la barra", r.ok, err(r));
    const ord = rows(r)[0]?.id;
    r = await as("O", `update public.bar_orders set status = 'completed', total_amount = 0 where id = $1 returning id`, [ord]);
    check("ni el dueño saltea el Kanban o cambia el total con un update directo", !r.ok);
    r = await as("O", `select (public.advance_bar_order($1)).status as s`, [ord]);
    check("el Kanban avanza por la RPC", r.ok && rows(r)[0].s === "preparing", err(r));
    await su(`insert into public.user_perks_qrs (event_id, user_id, title, perk_type) values ($1, $2, 'Trago', 'free_drink')`, [EV, U.B]);
    r = await as("O", `update public.user_perks_qrs set user_id = $1 where user_id = $2 returning id`, [U.O, U.B]);
    check("el staff no puede reasignarse QRs ajenos", !r.ok);

    // ── Eventos y sorteos
    r = await as("O", `select (public.set_staff_role($1, 'user_a', 'manager'))`, [EV]);
    r = await as("A", `update public.events set created_by = auth.uid() where id = $1 returning id`, [EV]);
    check("producción no puede adueñarse del evento (created_by)", !r.ok);
    r = await as("A", `update public.events set name = 'Fiesta 2' where id = $1 returning id`, [EV]);
    check("producción sí edita el evento", r.ok && rows(r).length === 1, err(r));
    r = await as("A", `insert into public.raffles (event_id, prize_title, winner_user_id) values ($1, 'Botella', auth.uid())`, [EV]);
    check("no se puede crear un sorteo con ganador elegido a mano", !r.ok);

    // ── Fuerza bruta de códigos
    let last: Q = { ok: true, rows: [] };
    for (let i = 0; i < 21; i++) last = await as("C", `select public.join_event($1, 'open_to_meet') as e`, [`SQ-${i.toString(16).padStart(10, "0")}`]);
    check("join_event: tras 20 códigos inválidos, bloquea un rato", !last.ok && /too_many_attempts/.test(err(last)), JSON.stringify(last));
    r = await as("C", `select public.join_event('fiesta-test', 'open_to_meet') as e`);
    check("…incluso con un código válido (hasta que pase la ventana)", !r.ok);
    for (let i = 0; i < 21; i++) last = await as(null, `select public.resolve_access_code($1) as x`, [`SQ-NOPE${i}`]);
    check("resolve_access_code (anon por IP): también se frena", !last.ok && /too_many_attempts/.test(err(last)), JSON.stringify(last));
    r = await as("A", `select * from public.access_code_failures`);
    check("nadie lee la tabla de intentos", denied(r));

    // ── Perfiles
    r = await as("A", `update public.profiles set photos = '["javascript:alert(1)"]' where id = auth.uid() returning id`);
    check("foto de perfil con URL no http(s) → rechazada", !r.ok);
    r = await as("A", `update public.profiles set is_verified = true where id = auth.uid() returning id`);
    check("nadie se auto-verifica", !r.ok);
    r = await as("B", `select phone_normalized from public.profiles where id = $1`, [U.A]);
    check("el teléfono ajeno sigue siendo ilegible", !r.ok);

  }, 60_000);

  it("todos los ataques quedan bloqueados y los flujos legítimos siguen andando", () => {
    expect(results.length).toBeGreaterThan(40);
    const failed = results.filter((r) => !r.pass).map((r) => `${r.label} ${r.detail}`);
    expect(failed).toEqual([]);
  });
});
