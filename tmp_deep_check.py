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

# Check full transaction detail
r = api_get(f"/api/v1/transactions/{tx_id}")
print("=== TRANSACTION ===")
print(json.dumps(r["data"], ensure_ascii=False, indent=2))

# Check recent 10 transactions
print("\n=== LAST 10 TRANSACTIONS ===")
r = api_get("/api/v1/transactions?page=1&page_size=10")
for t in r["data"]["items"]:
    price = t.get("price_ut", "")
    status = t.get("status", "")
    bid = t.get("buyer_user_id", "")
    sid = t.get("seller_user_id", "")
    tid = t.get("id", "")[:20]
    settled = t.get("settled_at", "")[:19] if t.get("settled_at") else "-"
    print(f"  [{status}] {price}UT | {tid} | settled={settled}")

# Full wallet
print("\n=== FULL WALLET ===")
r = api_get("/api/v1/wallet")
print(json.dumps(r["data"], ensure_ascii=False, indent=2))

# Cruise snapshot wallet
print("\n=== CRUISE WALLET ===")
r = api_get("/api/v1/agent/cruise?include=all")
d = r.get("data", {})
w = d.get("wallet", {})
print(json.dumps(w, ensure_ascii=False, indent=2))
print(f"\nWallet stats: {json.dumps(d.get('wallet_stats', {}), ensure_ascii=False)}")
