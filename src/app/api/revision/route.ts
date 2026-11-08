import { NextResponse } from "next/server";
import { getRevision } from "@/lib/revision";

// Always answer from the database: never prerendered, never cached.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Change token for live updates. Open pages poll this and refresh themselves
 * when the revision differs from the one they last saw.
 */
export async function GET() {
  try {
    const revision = await getRevision();
    return NextResponse.json({ revision }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/revision failed:", error);
    return NextResponse.json(
      { error: "Couldn't read the data revision." },
      { status: 503, headers: NO_STORE }
    );
  }
}
