import { NextResponse, type NextRequest } from "next/server";
import { removeConnection, userFromRequest } from "@/lib/instagram/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE → desconecta mi Instagram: borra el token y saca el @ del perfil. */
export async function DELETE(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  await removeConnection({ userId: user.id });
  return NextResponse.json({ ok: true });
}
