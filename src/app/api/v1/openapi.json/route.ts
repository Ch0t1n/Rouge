import { NextResponse, type NextRequest } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";
import { publicBase } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/openapi.json → especificación OpenAPI (para Postman, Insomnia o generar clientes). */
export async function GET(req: NextRequest) {
  return NextResponse.json(openApiSpec(publicBase(req)), { headers: { "Access-Control-Allow-Origin": "*" } });
}
