import { NextResponse } from "next/server";
import { apiAdmin, authenticate, codeCounts, handler, keyEvents, publicBase, requireScope } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/events → eventos a los que tiene acceso la clave, con el estado de sus códigos. */
export const GET = handler(async (req) => {
  const db = apiAdmin();
  const key = await authenticate(db, req);
  requireScope(key, "codes:read");
  const base = publicBase(req);
  const events = await keyEvents(db, key);
  const data = await Promise.all(
    events.map(async (e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      venue_name: e.venue_name,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      lobby_opens_at: e.lobby_opens_at,
      lobby_expires_at: e.lobby_expires_at,
      max_capacity: e.max_capacity,
      master_link: `${base}/join/${e.slug}`,
      codes: await codeCounts(db, e.id),
    })),
  );
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
