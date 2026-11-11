import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";

// The spec documents the API; it holds no data, so it needs no API key.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(buildOpenApiSpec());
}
