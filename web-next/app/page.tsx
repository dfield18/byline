/**
 * PHASE 0 SMOKE TEST — throwaway, delete before real UI work begins.
 *
 * This is NOT the new front end. Its only job is to prove that web-next
 * reaches the FastAPI backend through the copied `lib/api.ts` seam. If
 * this renders real subjects from :8000, Phase 0 is done and the backend
 * is confirmed out of scope for the redesign. No design here on purpose.
 */
import { listSubjects } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SeamCheck() {
  let payload: unknown = null;
  let error: string | null = null;
  try {
    payload = await listSubjects();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main style={{ fontFamily: "monospace", padding: 24, lineHeight: 1.5 }}>
      <h1>byline web-next — Phase 0 seam check</h1>
      <p>
        Backend: <code>{process.env.BYLINE_API_URL ?? "http://localhost:8000"}</code>
      </p>
      {error ? (
        <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>
          BACKEND ERROR:{"\n"}
          {error}
        </pre>
      ) : (
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </main>
  );
}
