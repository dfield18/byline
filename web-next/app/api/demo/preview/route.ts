/**
 * Public proxy for the landing hero demo.
 *
 * The marketing landing at `/` is unauthenticated, so it can't use the
 * server-only lib/api.ts helpers (those attach a Clerk JWT). Instead the
 * client posts a typed topic here, and this route forwards it to the
 * backend's own PUBLIC, rate-limited demo endpoint (POST /api/demo/preview).
 *
 * No auth is attached on purpose — the backend endpoint is intentionally
 * public. We forward the caller's IP via X-Forwarded-For so the backend's
 * per-IP rate limit sees the real visitor, not this server.
 *
 * Listed in proxy.ts `isPublicRoute` so Clerk middleware lets it through.
 */
import { NextResponse } from "next/server";

const API_URL = process.env.BYLINE_API_URL ?? "http://localhost:8000";

// Each grounded run can take ~30-60s; allow headroom on the serverless side.
export const maxDuration = 90;

export async function POST(req: Request) {
  let topic: unknown;
  try {
    ({ topic } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof topic !== "string" || topic.trim().length < 2) {
    return NextResponse.json(
      { error: "Enter a topic to analyze." },
      { status: 400 },
    );
  }

  // Preserve the real client IP for the backend's per-IP limiter.
  const fwd =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/demo/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(fwd ? { "X-Forwarded-For": fwd } : {}),
      },
      body: JSON.stringify({ topic: topic.trim().slice(0, 80) }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the analysis service. Try again shortly." },
      { status: 502 },
    );
  }

  const text = await res.text();
  if (!res.ok) {
    // Surface the backend's human-readable {detail} (rate-limit copy, etc.).
    let detail = "The live demo is unavailable right now.";
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    return NextResponse.json({ error: detail }, { status: res.status });
  }

  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
