#!/usr/bin/env python3
"""List all published digital assets with full details to find gaps"""
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

# List all published assets by category
r = get("/api/v1/digital-assets?page=1&page_size=100")
if r["ok"]:
    items = r["data"].get("data",{}).get("items", r["data"].get("items", []))
    published = [a for a in items if a.get("status") == "published"]
    
    # Group by tag/category
    print(f"=== All {len(published)} Published Digital Assets ===")
    for a in published:
        title = a["title"][:45]
        price = a.get("actual_price_ut") or a.get("suggested_price_ut","?")
        tags = ",".join(a.get("tags", []) or [])[:40]
        sold = a.get("sold_count", 0)
        fname = a.get("file_name", "")[:25]
        print(f"  {price:>6s} UT | {title:45s} | {fname:25s} | sold={sold}")
    print()
    
    # Identify categories
    cats = set()
    for a in published:
        for t in (a.get("tags") or []):
            cats.add(t)
    print(f"Tags in use ({len(cats)}): {sorted(cats)[:50]}")

# Check upload API to see supported file types
print("\n=== Checking Upload API ===")
r = get("/api/v1/upload/config")
if r["ok"]:
    print(json.dumps(r["data"], ensure_ascii=False)[:500])
elif r["code"] != 404:
    print(f"  {r}")
else:
    print("  /api/v1/upload/config: 404")
    
# Check knowledge assets upload format
r = get("/api/v1/digital-assets/upload/config")
if r["ok"]:
    print(json.dumps(r["data"], ensure_ascii=False)[:500])
elif r["code"] != 404:
    print(f"  {r}")
