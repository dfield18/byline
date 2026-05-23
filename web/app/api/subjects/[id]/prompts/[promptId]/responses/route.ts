import { NextResponse } from "next/server";
import { getPromptResponses } from "@/lib/api";

/**
 * Proxy GET /api/subjects/{id}/prompts/{promptId}/responses on the
 * Next side so the Prompts spoke's expanded-row panel can lazy-fetch
 * full response text from the browser. `lib/api.ts` is server-only
 * (imports Clerk server auth to attach the JWT), so the client
 * component can't call it directly — it hits this same-origin route
 * instead, which forwards through with the user's session cookie.
 */
export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string; promptId: string }>;
  },
) {
  const { id, promptId } = await context.params;
  const subjectId = Number.parseInt(id, 10);
  const pid = Number.parseInt(promptId, 10);
  if (Number.isNaN(subjectId) || Number.isNaN(pid)) {
    return NextResponse.json(
      { error: "invalid id" },
      { status: 400 },
    );
  }
  try {
    const data = await getPromptResponses(subjectId, pid);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("404")) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
