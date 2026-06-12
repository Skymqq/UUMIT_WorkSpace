#!/usr/bin/env python3
"""Test deleting or unpublishing digital assets"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]
headers = {"X-Api-Key": api_key, "X-Platform-User-Id": user_id, "Content-Type": "application/json"}
BASE = "https://api.uumit.com"

# First get all failed asset IDs
def api_get(path):
    req = urllib.request.Request(BASE + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def api_delete(path):
    req = urllib.request.Request(BASE + path, headers=headers, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"code": e.code, "message": e.read().decode()[:200]}

def api_post(path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"code": e.code, "message": e.read().decode()[:300]}

# Get all assets
all_items = []
page = 1
while True:
    resp = api_get("/api/v1/digital-assets?page=%d&page_size=100" % page)
    items = resp.get("data", {}).get("items", [])
    all_items.extend(items)
    if not resp.get("data", {}).get("has_more"):
        break
    page += 1

# Get failed asset IDs
failed_ids = [a["id"] for a in all_items if a.get("quality_assessment_status") == "failed"]
print("Failed asset IDs:")
for fid in failed_ids:
    a = [a for a in all_items if a["id"] == fid][0]
    print("  %s - %s" % (fid, a.get("title", "?")))

# Test delete on first failed asset
if failed_ids:
    test_id = failed_ids[0]
    print("\n--- Testing DELETE on %s ---" % test_id)
    result = api_delete("/api/v1/digital-assets/%s" % test_id)
    print("DELETE result:", json.dumps(result, ensure_ascii=False))

# Also test if there's an unpublish endpoint
print("\n--- Testing POST unpublish endpoint ---")
# Try a few common patterns
for endpoint in ["/api/v1/digital-assets/%s/unpublish" % test_id, 
                  "/api/v1/digital-assets/%s/archive" % test_id,
                  "/api/v1/digital-assets/%s/remove" % test_id]:
    print("Trying %s ..." % endpoint)
    result = api_post(endpoint, {})
    print("  Result:", json.dumps(result, ensure_ascii=False)[:200])
