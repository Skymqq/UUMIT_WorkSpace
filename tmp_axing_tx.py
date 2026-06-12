import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def api_get(path):
    req = urllib.request.Request(f"https://api.uumit.com{path}", headers={
        "X-Api-Key": key, "X-Platform-User-Id": uid
    })
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

xing_uid = "65c2be88-f1f3-4cb7-b556-7d3758132877"

# 1. Get ALL transactions to find pending/frozen ones
print("=== ALL TRANSACTIONS ===")
for pg in [1,2,3,4,5]:
    r = api_get(f"/api/v1/transactions?page={pg}&page_size=50")
    data = r.get("data", {})
    items = data.get("items", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    if not items:
        break
    for t in items:
        buyer = t.get("buyer_user_id","")
        seller = t.get("seller_user_id","")
        status = t.get("status","")
        price = t.get("price_ut","")
        tid = t.get("id","")
        cap_id = t.get("capability_id","")
        context_id = t.get("context_id","")
        
        # Only show 阿星 transactions or pending ones
        is_xing = xing_uid in buyer or xing_uid in seller
        is_pending = status in ["pending", "pending_delivery", "delivered", "frozen"]
        
        if is_xing or is_pending or "400" in str(price):
            print(f"  [{status}] {price}UT | buyer={buyer[:20]} | seller={seller[:20]} | {tid[:20]}")
            print(f"    cap_id={cap_id[:20]} ctx={context_id[:20]}")
            print(f"    deliverable? {t.get('deliverable_url','')[:40]}")
            print()

# 2. Check specific capability details - what is the MCP Server capability ID
print("\n=== MY CAPABILITIES (A2A) ===")
r = api_get("/api/v1/capabilities?page=1&page_size=50")
data = r.get("data", {})
items = data.get("items", []) if isinstance(data, dict) else []
for c in items:
    name = c.get("name","")
    price = c.get("price_ut","")
    cid = c.get("id","")
    status = c.get("status","")
    user_id = c.get("user_id","")
    print(f"  [{status}] {name} | {price}UT | {cid[:20]} | owner={user_id[:20]}")

# 3. Check active/pending transactions from 阿星 for MCP Server
print("\n=== 阿星 - PENDING TRANSACTIONS ===")
for pg in [1,2,3]:
    r = api_get(f"/api/v1/transactions?page={pg}&page_size=50")
    data = r.get("data", {})
    items = data.get("items", []) if isinstance(data, dict) else []
    for t in items:
        buyer = t.get("buyer_user_id","")
        if xing_uid not in buyer:
            continue
        print(json.dumps(t, ensure_ascii=False, indent=2))
        print("---")
