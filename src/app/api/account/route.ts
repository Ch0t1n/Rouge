import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Borrado REAL de la cuenta (paso 2): después de `delete_my_account` (que borra los datos con RLS), el servidor
 * elimina el usuario de Supabase Auth con service role. Solo si su perfil ya no existe (evita borrar cuentas
 * por error o sin pasar por la confirmación).
 */
export async function DELETE(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ error: { code: "not_configured", message: "Supabase no configurado." } }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: { code: "not_authenticated", message: "Falta la sesión." } }, { status: 401 });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await admin.auth.getUser(token);
  if (!who.user) return NextResponse.json({ error: { code: "not_authenticated", message: "Sesión inválida." } }, { status: 401 });
  const { data: still } = await admin.from("profiles").select("id").eq("id", who.user.id).maybeSingle();
  if (still) return NextResponse.json({ error: { code: "confirm_first", message: "Primero confirmá el borrado desde Privacidad." } }, { status: 409 });
  await admin.from("instagram_accounts").delete().eq("user_id", who.user.id);
  const { error } = await admin.auth.admin.deleteUser(who.user.id);
  if (error) return NextResponse.json({ error: { code: "delete_failed", message: "No se pudo borrar la cuenta." } }, { status: 500 });
  return NextResponse.json({ data: { deleted: true } });
}
