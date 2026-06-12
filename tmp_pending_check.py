#!/usr/bin/env python3
"""Check pending transactions and process opportunities"""
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

# 1. Check pending transactions from 4e3941ba
print("=== Pending Transactions from 4e3941ba ===")
r = get("/api/v1/transactions?page=1&page_size=50")
if r["ok"]:
    items = r["data"].get("data",{}).get("items", r["data"].get("items", []))
    for t in items:
        bid = t.get("buyer_user_id", "")
        if bid.startswith("4e3941ba"):
            print(f"  id: {t['id'][:20]}")
            print(f"  status: {t['status']}")
            print(f"  price: {t.get('price_ut','')} UT")
            print(f"  buyer_nickname: {t.get('buyer_nickname', 'N/A')}")
            print(f"  frozen_at: {t.get('frozen_at','-')}")
            print(f"  settled_at: {t.get('settled_at','-')}")
            print(f"  created_at: {t.get('created_at','-')}")
            print()

# 2. Check open tasks that we can apply to
print("=== Open Tasks We Can Apply To ===")
r = get("/api/v1/tasks/hall?page=1&page_size=30")
if r["ok"]:
    items = r["data"].get("data",{}).get("items", r["data"].get("items", []))
    for t in items:
        if t.get("status") == "open":
            tid = t.get("id","")[:16]
            title = t.get("title","")[:50]
            bounty = t.get("bounty","(not set)")
            owner = t.get("user_id","")[:12]
            print(f"  {title:50s} | bounty={bounty} | owner={owner} | id={tid}")

# 3. My digital assets with 0 sales - need to market them
print("\n=== Digital Assets Stats ===")
r = get("/api/v1/digital-assets?page=1&page_size=50")
if r["ok"]:
    items = r["data"].get("data",{}).get("items", r["data"].get("items", []))
    published = [a for a in items if a.get("status") == "published"]
    print(f"  Published: {len(published)}")
    with_sales = [a for a in published if (a.get("sold_count") or 0) > 0]
    print(f"  With sales: {len(with_sales)}")
    total_value = sum(float(a.get("actual_price_ut") or a.get("suggested_price_ut","0") or "0") for a in published)
    print(f"  Total listing value: {total_value:.0f} UT")
    # Show some priced assets
    for a in sorted(published, key=lambda x: float(x.get("actual_price_ut") or x.get("suggested_price_ut","0") or "0"), reverse=True)[:10]:
        p = float(a.get("actual_price_ut") or a.get("suggested_price_ut","0") or "0")
        print(f"    {a['title'][:35]:35s} @ {p:.0f} UT | sold={a.get('sold_count',0)}")
