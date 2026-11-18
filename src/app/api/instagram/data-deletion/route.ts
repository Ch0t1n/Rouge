import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { parseSignedRequest } from "@/lib/instagram/oauth";
import { rateLimited } from "@/lib/security/api";
import { igConfig, igConfigured, removeConnection, siteOrigin } from "@/lib/instagram/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Callback de Meta para "Deauthorize" y "Data Deletion Request" (obligatorios para App Review).
 * Recibe `signed_request` (form), borra el token y el @ de ese Instagram y responde lo que Meta espera.
 */
export async function POST(req: NextRequest) {
  const early = rateLimited(req, "igDataDeletion");
  if (early) return early;
  if (!igConfigured()) return NextResponse.json({ error: "ig_not_configured" }, { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > 8192) return NextResponse.json({ error: "invalid_signed_request" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(form?.get("signed_request")?.toString(), igConfig().appSecret);
  if (!data) return NextResponse.json({ error: "invalid_signed_request" }, { status: 400 });
  await removeConnection({ igUserId: data.user_id });
  const code = randomBytes(8).toString("hex");
  return NextResponse.json({ url: `${siteOrigin(req)}/login?ig_deleted=${code}`, confirmation_code: code });
}
