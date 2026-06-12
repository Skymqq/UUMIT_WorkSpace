import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def api_req(method, path, data=None, extra_headers=None):
    body = json.dumps(data).encode() if data else None
    headers = {"X-Api-Key": key, "X-Platform-User-Id": uid}
    if data:
        headers["Content-Type"] = "application/json"
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return {"ok": True, "code": resp.status, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:500] if e.fp else str(e)}

tx_id = "2a5719a6-4a36-43a6-b688-50321ed6fc96"

# Try seller to confirm (maybe the seller can mark as done after delivery)
print("=== TRY SELLER CONFIRM ===")
for body in [{}, {"confirm": True}]:
    r = api_req("POST", f"/api/v1/transactions/{tx_id}/confirm", body)
    print(f"  POST confirm {body}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# Try to settle directly
print("\n=== TRY SETTLE ===")
r = api_req("POST", f"/api/v1/transactions/{tx_id}/settle")
print(f"  POST settle: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# Check wallet again
print("\n=== WALLET AFTER DELIVERY ===")
r = api_req("GET", "/api/v1/wallet")
if r["ok"]:
    w = r["data"]["data"]
    ut = w.get("ut", {})
    print(f"UT Balance: {ut.get('balance')}")
    print(f"UT Available: {ut.get('available')}")
    print(f"UT Frozen: {ut.get('frozen')}")
    print(f"UT Withdrawable: {ut.get('withdrawable_balance')}")

# Try to send a notification/message to 阿星
print("\n=== CHECK NOTIFICATION/INBOX ENDPOINTS ===")
for ep in ["/api/v1/notifications", "/api/v1/messages", "/api/v1/inbox"]:
    r = api_req("GET", f"{ep}?page=1&page_size=5")
    print(f"  {ep}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:300]}")

# Check if 阿星 has a user info endpoint to contact them
print("\n=== CHECK USER INFO ===")
xing_id = "65c2be88-f1f3-4cb7-b556-7d3758132877"
r = api_req("GET", f"/api/v1/users/{xing_id}")
if r["ok"]:
    u = r["data"]["data"]
    print(f"Nickname: {u.get('nickname')}")
    print(f"Keys: {list(u.keys())}")
else:
    print(f"  Error: {r.get('body','')[:200]}")
