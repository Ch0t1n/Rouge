import { NextResponse } from "next/server";
import { apiAdmin, authenticate, handler, issueCodes, listCodes, parseListQuery, publicBase, resolveEvent, serializeCode, validateIssueBody, ApiError } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * POST /api/v1/events/{eventId|slug}/codes
 *   { "tickets": [{ "external_ref": "ORD-1-A", "label": "VIP" }, …] }  → un código por entrada (idempotente)
 *   { "count": 50, "label": "Cortesía" }                              → códigos sueltos
 */
export const POST = handler<Ctx>(async (req, { params }) => {
  const db = apiAdmin();
  const key = await authenticate(db, req);
  const event = await resolveEvent(db, key, (await params).eventId, "codes:write");
  const body = await req.json().catch(() => {
    throw new ApiError("validation_error", "El body no es JSON válido.");
  });
  const rows = await issueCodes(db, key, event.id, validateIssueBody(body));
  const base = publicBase(req);
  const created = rows.filter((r) => r.created).length;
  return NextResponse.json(
    { event_id: event.id, created, existing: rows.length - created, data: rows.map((r) => serializeCode(r, base)) },
    { status: created > 0 ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
});

/** GET /api/v1/events/{eventId|slug}/codes?status=&external_ref=&label=&used_since=&limit=&cursor= */
export const GET = handler<Ctx>(async (req, { params }) => {
  const db = apiAdmin();
  const key = await authenticate(db, req);
  const event = await resolveEvent(db, key, (await params).eventId, "codes:read");
  const { rows, next } = await listCodes(db, event.id, parseListQuery(req.nextUrl.searchParams));
  const base = publicBase(req);
  return NextResponse.json({ event_id: event.id, data: rows.map((r) => serializeCode(r, base)), next_cursor: next }, { headers: { "Cache-Control": "no-store" } });
});
