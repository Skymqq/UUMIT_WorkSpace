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

# Check ALL transactions to see if a NEW one was created
print("=== ALL TRANSACTIONS (checking for new ones) ===")
for pg in [1,2,3]:
    r = api_get(f"/api/v1/transactions?page={pg}&page_size=50")
    items = r["data"]["items"]
    if not items: break
    for t in items:
        tx_id = t.get("id","")
        price = t.get("price_ut","")
        status = t.get("status","")
        cap_id = t.get("capability_id","")[:20]
        buyer = t.get("buyer_user_id","")[:20]
        settled = (t.get("settled_at") or "")[:19]
        confirmed = (t.get("confirmed_at") or "")[:19]
        
        # Show MCP-related or 400UT transactions
        if "400" in str(price) or cap_id[:20] == "7e528635-2823-4b30-8":
            print(f"\n  [{status}] {price}UT | {tx_id}")
            print(f"    cap_id={cap_id} | buyer={buyer}")
            print(f"    confirmed={confirmed} | settled={settled}")
            print(f"    seller_income={t.get('seller_income_ut','')}UT")

# Also check the capability for MCP Server
print("\n=== MCP SERVER CAPABILITY STATS ===")
r = api_get("/api/v1/capabilities/7e528635-2823-4b30-8355-9e97c1507831")
d = r["data"]
print(f"Total sold: {d.get('total_sold')}")
print(f"Quality score: {d.get('quality_score')}")

# Full wallet to see income today
print("\n=== WALLET INCOME ===")
r = api_get("/api/v1/wallet")
d = r["data"]["ut"]
print(f"Balance: {d['balance']} UT")
print(f"Available: {d['available']} UT")
print(f"Frozen: {d['frozen']} UT")
print(f"Withdrawable: {d.get('withdrawable_balance')} UT")
print(f"Pending withdrawal: {d.get('pending_withdrawal')} UT")
print(f"Effective withdrawable: {d.get('effective_withdrawable')} UT")

# Check wallet stats for today's income
r = api_get("/api/v1/agent/cruise?include=all")
stats = r["data"]["wallet_stats"]["ut"]
print(f"\nToday income: {stats['today_income']} UT")
print(f"Today expense: {stats['today_expense']} UT")
