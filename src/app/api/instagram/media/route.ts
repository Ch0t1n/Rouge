import { NextResponse, type NextRequest } from "next/server";
import { downloadPhoto, IgError, listPhotos, tokenFor, userFromRequest } from "@/lib/instagram/server";
import { rateLimited, readJsonBody } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
  const err = e instanceof IgError ? e : new IgError("ig_api_error", 502);
  return NextResponse.json({ error: err.code }, { status: err.status });
};

/** GET → mis fotos de Instagram importables { items: [{ id, url, permalink }] } (requiere Bearer). */
export async function GET(req: NextRequest) {
  const early = rateLimited(req, "igList");
  if (early) return early;
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const limited = rateLimited(req, "igList", user.id);
  if (limited) return limited;
  try {
    return NextResponse.json({ items: await listPhotos(await tokenFor(user.id)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

/** POST { id } → bytes de esa foto (mismo origen) para recomprimir y subir a Storage. */
export async function POST(req: NextRequest) {
  const early = rateLimited(req, "igDownload");
  if (early) return early;
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const limited = rateLimited(req, "igDownload", user.id);
  if (limited) return limited;
  const body = await readJsonBody<{ id?: unknown }>(req, 512);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "ig_bad_media" }, { status: 400 });
  try {
    const photo = await downloadPhoto(await tokenFor(user.id), id);
    return new NextResponse(photo.bytes, {
      headers: { "Content-Type": photo.type, "Cache-Control": "no-store", "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return fail(e);
  }
}
