import { NextResponse, type NextRequest } from "next/server";
import { rateLimited } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024;

/**
 * Reportes de violaciones de la CSP (`report-uri` en src/proxy.ts). Solo los registra en los logs del
 * servidor, recortados: sirven para detectar un origen legítimo que falta o un intento de inyección.
 */
export async function POST(req: NextRequest) {
  if (rateLimited(req, "cspReport")) return new NextResponse(null, { status: 204 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return new NextResponse(null, { status: 413 });
  const text = (await req.text().catch(() => "")).slice(0, MAX_BYTES);
  try {
    const body = JSON.parse(text) as { "csp-report"?: Record<string, unknown> };
    const r = body["csp-report"] ?? {};
    const pick = (k: string) => String(r[k] ?? "").slice(0, 200);
    console.warn("[csp]", pick("violated-directive") || pick("effective-directive"), pick("blocked-uri"), pick("document-uri"));
  } catch {
    /* reporte inválido: se ignora */
  }
  return new NextResponse(null, { status: 204 });
}
