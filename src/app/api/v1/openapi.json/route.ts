import { NextResponse, type NextRequest } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";
import { errorResponse, publicBase } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/openapi.json → especificación OpenAPI (para Postman, Insomnia o generar clientes). */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(openApiSpec(publicBase(req)), { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return errorResponse(e);
  }
}
