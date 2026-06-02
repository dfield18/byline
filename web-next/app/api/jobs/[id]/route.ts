import { NextResponse } from "next/server";
import { getJob } from "@/lib/api";

/**
 * Proxy GET /api/jobs/{id} on the Next side so client components can
 * poll while authenticated via the user's Clerk session. The real API
 * (FastAPI) is server-side only — lib/api.ts attaches the JWT.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const jobId = Number.parseInt(id, 10);
  if (Number.isNaN(jobId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const job = await getJob(jobId);
    return NextResponse.json(job);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("404")) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
