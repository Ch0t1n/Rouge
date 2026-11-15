import { NextResponse, type NextRequest } from "next/server";
import { downloadPhoto, IgError, listPhotos, tokenFor, userFromRequest } from "@/lib/instagram/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
  const err = e instanceof IgError ? e : new IgError("ig_api_error", 502);
  return NextResponse.json({ error: err.code }, { status: err.status });
};

/** GET → mis fotos de Instagram importables { items: [{ id, url, permalink }] } (requiere Bearer). */
export async function GET(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  try {
    return NextResponse.json({ items: await listPhotos(await tokenFor(user.id)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

/** POST { id } → bytes de esa foto (mismo origen) para recomprimir y subir a Storage. */
export async function POST(req: NextRequest) {
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "ig_bad_media" }, { status: 400 });
  try {
    const photo = await downloadPhoto(await tokenFor(user.id), id);
    return new NextResponse(photo.bytes, { headers: { "Content-Type": photo.type, "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}
