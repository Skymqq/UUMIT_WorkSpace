#!/usr/bin/env python3
"""
Check API for unpublishing and price updating
"""
import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
api_key = auth["cached_api_key"]
user_id = auth["cached_user_id"]
headers = {"X-Api-Key": api_key, "X-Platform-User-Id": user_id, "Content-Type": "application/json"}
BASE = "https://api.uumit.com"

def api_get(path):
    req = urllib.request.Request(BASE + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def api_post(path, body={}):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"code": 0, "data": json.loads(r.read())}
    except urllib.error.HTTPError as e:
        return {"code": e.code, "error": e.read().decode()[:500]}

def api_patch(path, body={}):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"code": 0, "data": json.loads(r.read())}
    except urllib.error.HTTPError as e:
        return {"code": e.code, "error": e.read().decode()[:500]}

def api_put(path, body={}):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"code": 0, "data": json.loads(r.read())}
    except urllib.error.HTTPError as e:
        return {"code": e.code, "error": e.read().decode()[:500]}

# Get a sample asset
resp = api_get("/api/v1/digital-assets?page=1&page_size=1")
item = resp.get("data", {}).get("items", [{}])[0]
aid = item.get("id")
print("Sample asset id:", aid)

# Try unpublish
print("\n--- Testing unpublish ---")
result = api_post("/api/v1/digital-assets/%s/unpublish" % aid)
print("Unpublish result:", json.dumps(result, ensure_ascii=False)[:300])

# Try price update via PATCH
print("\n--- Testing PATCH price update ---")
result = api_patch("/api/v1/digital-assets/%s" % aid, {"price_ut": 500})
print("PATCH result:", json.dumps(result, ensure_ascii=False)[:300])

# Try PUT price update
print("\n--- Testing PUT price update ---")
result = api_put("/api/v1/digital-assets/%s" % aid, {"price_ut": 500})
print("PUT result:", json.dumps(result, ensure_ascii=False)[:300])

# Try PATCH publish (update publish price)
print("\n--- Testing other endpoints ---")
for ep in ["/api/v1/digital-assets/%s/price" % aid,
           "/api/v1/digital-assets/%s/update" % aid]:
    result = api_post(ep, {"price_ut": 500})
    print("POST %s: %s" % (ep, json.dumps(result, ensure_ascii=False)[:200]))
