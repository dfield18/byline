"""Ad-hoc backend QA sweep against the running API (:8000, BYLINE_AUTH=disabled).

Exercises every endpoint for: happy-path status, schema sanity, error handling
(404/422), and org-tenancy isolation. Read-only — does NOT trigger refreshes,
regenerations, or subject creation (only their validation paths).
"""
from __future__ import annotations
import json, sys, urllib.request, urllib.error

BASE = "http://127.0.0.1:8000"
TOK = "dev-token"

# Known fixtures (org_internal owns 15-19; subject 13/refresh 22 are a DIFFERENT org)
IN_SUBJ, IN_REFRESH, IN_RESP, IN_PROMPT = 15, 59, 1024, 77
OUT_SUBJ, OUT_REFRESH = 13, 22

results = []  # (name, ok, detail)

def call(method, path, expect, body=None, headers=None, note=""):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Authorization": f"Bearer {TOK}"}
    if data is not None:
        h["Content-Type"] = "application/json"
    if headers is not None:
        h = headers
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            code, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, raw = e.code, e.read()
    except Exception as e:
        results.append((f"{method} {path}", False, f"EXC {e}"))
        return None, None
    try:
        payload = json.loads(raw) if raw else None
    except Exception:
        payload = raw[:200]
    exp = expect if isinstance(expect, (list, tuple)) else [expect]
    ok = code in exp
    detail = f"{code} (want {exp}) {note}"
    results.append((f"{method} {path}", ok, detail))
    return code, payload

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

print("Running QA sweep...\n")

# 1. Health
call("GET", "/healthz", 200)

# 2. List subjects — should ONLY contain org_internal subjects (15-19), NOT 13
code, subs = call("GET", "/api/subjects", 200)
if subs is not None:
    ids = {s.get("id") for s in subs} if isinstance(subs, list) else set(
        s.get("id") for s in subs.get("subjects", []))
    # handle either list or wrapper
    if isinstance(subs, dict):
        ids = {s.get("id") for s in subs.get("subjects", subs.get("items", []))}
    check("subjects: in-org 15 present", IN_SUBJ in ids, f"ids={sorted(i for i in ids if i)}")
    check("TENANCY subjects: out-of-org 13 ABSENT", OUT_SUBJ not in ids,
          f"leak={OUT_SUBJ in ids}")

# 3. Subject detail (in-org)
call("GET", f"/api/subjects/{IN_SUBJ}", 200)
# 4. TENANCY: subject detail out-of-org -> must be 403/404, NOT 200
code, _ = call("GET", f"/api/subjects/{OUT_SUBJ}", [403, 404], note="tenancy: Obama must be hidden")
# 5. Nonexistent subject
call("GET", "/api/subjects/999999", [404], note="nonexistent")
# 6. Malformed id (non-int)
call("GET", "/api/subjects/not-an-int", [422], note="type validation")

# 7. Overview (in-org)
code, ov = call("GET", f"/api/subjects/{IN_SUBJ}/overview", 200)
if ov:
    # metric-naming landmine: competitive[].sov (mention rate) vs trajectory.share_of_voice (pie share)
    has_comp = "competitive" in ov
    has_traj = "trajectory" in ov
    check("overview has competitive[]", has_comp)
    check("overview has trajectory", has_traj)
# 8. Overview out-of-org -> 403/404
call("GET", f"/api/subjects/{OUT_SUBJ}/overview", [403, 404], note="tenancy")

# 9. Prompt responses (in-org)
call("GET", f"/api/subjects/{IN_SUBJ}/prompts/{IN_PROMPT}/responses", 200)
# 10. Prompt responses for out-of-org subject
call("GET", f"/api/subjects/{OUT_SUBJ}/prompts/{IN_PROMPT}/responses", [403, 404], note="tenancy")

# 11. Refresh findings (in-org)
call("GET", f"/api/refreshes/{IN_REFRESH}/findings", 200)
# 12. Refresh responses (in-org)
call("GET", f"/api/refreshes/{IN_REFRESH}/responses", 200)
# 13. TENANCY: out-of-org refresh findings -> must NOT be 200
call("GET", f"/api/refreshes/{OUT_REFRESH}/findings", [403, 404], note="tenancy: Obama's refresh")
call("GET", f"/api/refreshes/{OUT_REFRESH}/responses", [403, 404], note="tenancy: Obama's refresh")
# 14. Nonexistent refresh
call("GET", "/api/refreshes/999999/findings", [403, 404], note="nonexistent")

# 15. Response detail (in-org)
call("GET", f"/api/responses/{IN_RESP}", 200)
# 16. Nonexistent response
call("GET", "/api/responses/999999", [403, 404], note="nonexistent")

# 17. Job — nonexistent
call("GET", "/api/jobs/999999", [403, 404, 422], note="no jobs exist yet")

# 18. Categories
call("GET", "/api/categories/person/slots", 200)
call("GET", "/api/categories/person/setup-inputs", 200)
call("GET", "/api/categories/bogus-slug/slots", [404], note="unknown category")

# 19. POST validation only (NO real side effects): empty body -> 422
call("POST", "/api/subjects", [422], body={}, note="create validation (empty body)")

# --- report ---
print(f"{'RESULT':6} TEST")
print("-" * 70)
passed = failed = 0
for name, ok, detail in results:
    tag = " PASS " if ok else "*FAIL*"
    if ok: passed += 1
    else: failed += 1
    print(f"{tag} {name:52} {detail}")
print("-" * 70)
print(f"{passed} passed, {failed} failed, {passed+failed} total")
sys.exit(1 if failed else 0)
