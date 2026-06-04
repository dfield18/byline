/**
 * Public proxy for the landing "try it" flow — POST a topic, get back a
 * try-subject id + job. Forwards to the backend's public POST /api/try
 * (no auth; the landing visitor has no session). Mirrors the demo proxy.
 *
 * Listed in proxy.ts isPublicRoute so Clerk middleware lets it through.
 */
import { NextResponse } from "next/server";

const API_URL = process.env.BYLINE_API_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  let topic: unknown;
  let turnstileToken: unknown;
  try {
    ({ topic, turnstile_token: turnstileToken } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof topic !== "string" || topic.trim().length < 2) {
    return NextResponse.json({ error: "Enter a topic to analyze." }, { status: 400 });
  }

  const fwd = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/try`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(fwd ? { "X-Forwarded-For": fwd } : {}),
      },
      body: JSON.stringify({
        topic: topic.trim().slice(0, 80),
        turnstile_token: typeof turnstileToken === "string" ? turnstileToken : null,
      }),
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
    let detail = "The live demo is unavailable right now.";
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      /* keep generic */
    }
    return NextResponse.json({ error: detail }, { status: res.status });
  }
  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
