import { NextResponse } from "next/server";
import { apiAdmin, authenticate, getCode, handler, publicBase, resolveEvent, revokeCode, serializeCode } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string; code: string }> };

/** GET → estado de un código (unused / used / revoked). Sirve para el check-in o el soporte. */
export const GET = handler<Ctx>(async (req, { params }) => {
  const { eventId, code } = await params;
  const db = apiAdmin();
  const key = await authenticate(db, req);
  const event = await resolveEvent(db, key, eventId, "codes:read");
  return NextResponse.json({ data: serializeCode(await getCode(db, event.id, code), publicBase(req)) }, { headers: { "Cache-Control": "no-store" } });
});

/** DELETE → anula un código que no se usó (entrada reembolsada o cancelada). Idempotente. */
export const DELETE = handler<Ctx>(async (req, { params }) => {
  const { eventId, code } = await params;
  const db = apiAdmin();
  const key = await authenticate(db, req);
  const event = await resolveEvent(db, key, eventId, "codes:write");
  return NextResponse.json({ data: serializeCode(await revokeCode(db, key, event.id, code), publicBase(req)) }, { headers: { "Cache-Control": "no-store" } });
});
