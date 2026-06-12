#!/usr/bin/env python3
"""Check UUMit digital assets and attempt to understand the API better"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]
headers = {"X-Api-Key": api_key, "X-Platform-User-Id": user_id, "Content-Type": "application/json"}

def api_get(path):
    req = urllib.request.Request("https://api.uumit.com" + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

# Get first asset with quality failed to see its details
resp = api_get("/api/v1/digital-assets?page=1&page_size=100")
items = resp.get("data", {}).get("items", [])

# Find a failed one
failed = [a for a in items if a.get("quality_assessment_status") == "failed"]
if failed:
    a = failed[0]
    print("Failed asset id:", a.get("id"))
    print("Status:", a.get("status"))
    print("Published:", a.get("published"))
    print("Quality gate:", a.get("quality_gate_status"))
    print("Quality gate reason:", a.get("quality_gate_reason"))
    # Try to see what API options exist
    # Is there an unpublish endpoint?
    # The batch_publish.js uses /api/v1/digital-assets/{id}/publish to publish
    # Maybe there's a /unpublish endpoint too?

print("\n=== Summary of all 120 items ===")
# Show distribution of statuses
statuses = {}
for a in items:
    s = a.get("quality_assessment_status", "unknown")
    statuses[s] = statuses.get(s, 0) + 1
print("Status distribution:", statuses)

# Show items with quality_score >= 0.7 that have proper titles
print("\n=== Top high-quality items with titles (qscore >= 0.7) ===")
candidates = []
for a in items:
    qs = a.get("quality_score")
    if a.get("published") == True:
        continue
    if qs and float(qs) >= 0.7:
        title = a.get("title")
        if title and title != "None":
            candidates.append(a)

print("Count with titles: %d" % len(candidates))
# Sort by quality score descending
candidates.sort(key=lambda x: float(x.get("quality_score", 0)), reverse=True)
for a in candidates[:20]:
    aid = a.get("id", "?")
    title = a.get("title", "?")
    qscore = float(a.get("quality_score", 0))
    suggested = a.get("suggested_price_ut", "?")
    print("[%s] q=%.2f suggested=%s %s" % (aid[:8], qscore, suggested, title))
