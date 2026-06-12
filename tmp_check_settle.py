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

tx_id = "2a5719a6-4a36-43a6-b688-50321ed6fc96"

# 1. Get full transaction detail
print("=== FULL TRANSACTION DETAIL ===")
r = api_get(f"/api/v1/transactions/{tx_id}")
d = r.get("data", {})
print(json.dumps(d, ensure_ascii=False, indent=2))

# 2. Check the cruise snapshot to see if it's still frozen or moved
print("\n=== CRUISE SNAPSHOT ===")
r = api_get("/api/v1/agent/cruise?include=all")
data = r.get("data", {})
frozen = data.get("transactions_frozen", [])
print(f"Frozen: {len(frozen)}")
accepted = data.get("transactions_accepted", {})
accepted_items = accepted.get("items", [])
print(f"Accepted: {len(accepted_items)}")

# 3. Check wallet to see if funds are released
print("\n=== WALLET ===")
r = api_get("/api/v1/wallet")
print(json.dumps(r.get("data",{}), ensure_ascii=False)[:500])

# 4. Check recent transactions for settlement
print("\n=== RECENT SETTLED TRANSACTIONS ===")
r = api_get("/api/v1/transactions?page=1&page_size=20")
data = r.get("data", {})
items = data.get("items", []) if isinstance(data, dict) else []
for t in items:
    if t.get("buyer_user_id","")[:20] == "65c2be88-f1f3-4cb7-b":
        print(f"  [{t['status']}] {t.get('price_ut')}UT | delivered={t.get('delivered_at','')[:19]} | settled={t.get('settled_at','')[:19]}")
