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

def api_post(path, data=None, extra_headers=None):
    body = json.dumps(data).encode() if data else None
    headers = {
        "X-Api-Key": key, "X-Platform-User-Id": uid,
        "Content-Type": "application/json"
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return {"ok": True, "data": json.loads(resp.read()), "status": resp.status}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode()[:500] if e.fp else str(e)}

tx_id = "2a5719a6-4a36-43a6-b688-50321ed6fc96"

# 1. Try GET on the accept/deliver endpoints (maybe they need query params)
print("=== TRY GET ON ACTION ENDPOINTS ===")
for ep in [f"/api/v1/transactions/{tx_id}/accept", 
           f"/api/v1/transactions/{tx_id}/deliver",
           f"/api/v1/transactions/{tx_id}/confirm"]:
    try:
        r = api_get(ep)
        print(f"  GET {ep}: {json.dumps(r, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"  GET {ep}: {str(e)[:100]}")

# 2. Try PUT instead of POST
print("\n=== TRY PUT ON ACTION ENDPOINTS ===")
for ep in [f"/api/v1/transactions/{tx_id}/accept"]:
    body = json.dumps({}).encode()
    headers = {"X-Api-Key": key, "X-Platform-User-Id": uid, "Content-Type": "application/json"}
    req = urllib.request.Request(f"https://api.uumit.com{ep}", data=body, headers=headers, method="PUT")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        print(f"  PUT {ep}: {json.loads(resp.read())}")
    except urllib.error.HTTPError as e:
        print(f"  PUT {ep}: {e.code} - {e.read().decode()[:200]}")

# 3. Check the cruise snapshot endpoint
print("\n=== CRUISE SNAPSHOT ===")
r = api_get("/api/v1/agent/cruise?include=all")
data = r.get("data", {})
pending = data.get("pending_transactions", [])
print(f"Pending transactions: {len(pending)}")
for pt in pending:
    ptx_id = pt.get("id", pt.get("transaction_id", ""))
    ptx_status = pt.get("status", "")
    ptx_price = pt.get("price_ut", "")
    print(f"  [{ptx_status}] {ptx_price}UT | {ptx_id[:20]}")
    # Print full detail for the frozen one
    if ptx_id[:20] == tx_id[:20]:
        print(f"  FULL: {json.dumps(pt, ensure_ascii=False)[:800]}")

# 4. Try to accept the transaction via the cruise agent endpoint
print("\n=== TRY AGENT ACTION ENDPOINTS ===")
for ep in [f"/api/v1/agent/transactions/{tx_id}/accept",
           f"/api/v1/agent/transactions/{tx_id}/deliver",
           f"/api/v1/agent/transactions/{tx_id}/complete"]:
    result = api_post(ep, {"note": "Accepting MCP Server order"})
    print(f"  POST {ep}: code={result['status']}, {json.dumps(result.get('data',{}), ensure_ascii=False)[:200] if result['ok'] else result['body']}")

# 5. Check the cruise snapshot for pending_transactions more carefully
print("\n=== CRUISE FULL DATA (truncated) ===")
cruise = r.get("data", {})
print(f"Keys in cruise data: {list(cruise.keys())}")
for k, v in cruise.items():
    if isinstance(v, list):
        print(f"  {k}: {len(v)} items")
        if len(v) > 0 and k != "pending_transactions":
            print(f"    sample: {json.dumps(v[0], ensure_ascii=False)[:200]}")
    elif isinstance(v, dict):
        print(f"  {k}: {len(v)} keys")
