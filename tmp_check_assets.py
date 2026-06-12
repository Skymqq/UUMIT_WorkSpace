#!/usr/bin/env python3
"""Check asset detail and available actions"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def get(path):
    req = urllib.request.Request(f"https://api.uumit.com{path}", headers={"X-Api-Key": key, "X-Platform-User-Id": uid})
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        return {"ok": True, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:1000]}

# Check failed assets detail
aid = "4fa32ab9-bb4c-46f1-80d6-f781d2aae1e0"
print("=== Asset Detail ===")
r = get(f"/api/v1/digital-assets/{aid}")
if r["ok"]:
    d = r["data"]
    print(json.dumps(d, ensure_ascii=False)[:2000])
else:
    print(f"FAIL: {r}")

# List all to see search/filter
print("\n=== All assets with quality info ===")
r = get("/api/v1/digital-assets?page=1&page_size=50")
if r["ok"]:
    data = r["data"]
    items = (data.get("data") or data).get("items") or data.get("data",{}).get("items",[])
    if not items and isinstance(data, dict):
        items = data.get("items", [])
    if not items:
        items = data.get("data",{}).get("records",[])
    print(f"Total items: {len(items)}")
    for a in items:
        qg = a.get("quality_gate_status", "")
        st = a.get("status", "")
        qa = a.get("quality_assessment_status", "")
        attempts = a.get("quality_assessment_attempts", 0)
        if qg == "failed_assessment":
            print(f"  FAIL: {a['title'][:30]:30s} | status={st:12s} | qa={qa:12s} | attempts={attempts}")
        elif qg == "passed":
            pub = a.get("status", "")
            print(f"  PASS: {a['title'][:30]:30s} | status={st:12s}")
