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

# Check transaction status
r = api_get(f"/api/v1/transactions/{tx_id}")
d = r["data"]
print(f"Status: {d['status']}")
print(f"Accepted at: {d.get('accepted_at')}")
print(f"Delivered at: {d.get('delivered_at')}")
print(f"Confirmed at: {d.get('confirmed_at')}")
print(f"Settled at: {d.get('settled_at')}")
print(f"Seller income: {d.get('seller_income_ut')} UT")
print(f"Price: {d.get('price_ut')} UT")

# Check wallet
print("\n=== WALLET ===")
r = api_get("/api/v1/wallet")
ut = r["data"]["ut"]
print(f"Balance: {ut['balance']} UT")
print(f"Available: {ut['available']} UT")
print(f"Frozen: {ut['frozen']} UT")

# Check recent transactions for settlement
print("\n=== RECENT TRANSACTIONS ===")
r = api_get("/api/v1/transactions?page=1&page_size=5")
items = r["data"]["items"]
for t in items:
    if t.get("price_ut") == "400.00" or t.get("id","")[:20] == tx_id[:20]:
        print(f"  [{t['status']}] {t.get('price_ut')}UT | confirmed={t.get('confirmed_at','')[:19]} | settled={t.get('settled_at','')[:19]}")
