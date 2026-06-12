#!/usr/bin/env python3
"""Check published digital assets sales and capabilities"""
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

# 1. Check published asset sales
print("=== Published Digital Assets - Sales ===")
r = get("/api/v1/digital-assets?page=1&page_size=50")
if r["ok"]:
    data = r["data"]
    items = data.get("data", {}).get("items", data.get("items", []))
    total = 0
    sold_any = 0
    revenue = 0
    published = 0
    for a in items:
        if a.get("status") == "published":
            published += 1
            s = a.get("sold_count", 0) or 0
            p = float(a.get("actual_price_ut") or a.get("suggested_price_ut", "0") or "0")
            rv = s * p
            total += s
            revenue += rv
            if s > 0:
                sold_any += 1
                print(f"  [{s:3d} sold] {a['title'][:35]:35s} @ {p:.0f} UT = {rv:.0f} UT")
    print(f"\n  Published: {published}")
    print(f"  With sales: {sold_any}")
    if published > 0:
        print(f"  Total sales: {total} units, {revenue:.0f} UT revenue")
    else:
        print(f"  Total sales: {total} units")

# 2. Capabilities - check the raw response
print("\n=== Capabilities (Raw) ===")
r = get("/api/v1/capabilities?page=1&page_size=50")
if r["ok"]:
    data = r["data"]
    items = data.get("items", data.get("data", {}).get("items", []))
    print(f"Total capabilities found: {len(items)}")
    if items:
        # Show first one's full structure
        print(f"First cap full:")
        print(json.dumps(items[0], ensure_ascii=False)[:1000])

# 3. Try skills endpoint
print("\n=== Skills ===")
for ep in ["/api/v1/skills", "/api/v1/skills?page=1", "/api/v1/my-skills"]:
    r2 = get(ep)
    if r2["ok"]:
        print(f"  {ep}: OK")
        d = r2["data"]
        print(f"    {json.dumps(d, ensure_ascii=False)[:500]}")
        break
    elif r2["code"] != 404:
        print(f"  {ep}: {r2}")
