import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { CODE_RE, errorResponse, ApiError, publicBase } from "@/lib/api/v1";
import { allowRequest } from "@/lib/security/api";

export const runtime = "nodejs";

/**
 * GET /api/v1/qr/{código}[?format=svg&size=512] → QR del link de ingreso (/join/{código}).
 * PNG por defecto (los clientes de mail no muestran SVG). Público: no consulta la base, solo dibuja
 * el link, así que no revela si un código existe.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!allowRequest(req, "apiQr")) return errorResponse(new ApiError("rate_limited"));
  const { code } = await params;
  if (!CODE_RE.test(code)) return errorResponse(new ApiError("validation_error", "Código inválido."));
  const format = req.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const size = Math.min(1024, Math.max(128, Number(req.nextUrl.searchParams.get("size")) || 512));
  let base: string;
  try {
    base = publicBase(req);
  } catch (e) {
    return errorResponse(e);
  }
  const url = `${base}/join/${code}`;
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, width: size, color: { dark: "#070709", light: "#FFFFFF" } };
  const headers = { "Cache-Control": "public, max-age=31536000, immutable" };
  if (format === "svg") {
    return new NextResponse(await QRCode.toString(url, { ...opts, type: "svg" }), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  const png = await QRCode.toBuffer(url, { ...opts, type: "png" });
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
}
