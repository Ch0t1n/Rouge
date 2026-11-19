import { NextResponse } from "next/server";
import { API_VERSION } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** GET /api/v1 → presentación de la API. */
export async function GET() {
  return NextResponse.json({ name: "Rouge Pass API", version: API_VERSION, docs: "/api/v1/openapi.json" });
}
