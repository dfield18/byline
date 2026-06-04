/**
 * Public proxy for polling a try-subject's refresh status while its Overview
 * builds. Forwards to the backend's public GET /api/try/{id}/status.
 * Listed in proxy.ts isPublicRoute.
 */
import { NextResponse } from "next/server";

const API_URL = process.env.BYLINE_API_URL ?? "http://localhost:8000";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_URL}/api/try/${id}/status`, { cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ status: "unknown", job_id: null, error: null }, { status: 502 });
  }
}
