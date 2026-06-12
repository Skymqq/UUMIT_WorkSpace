import json, urllib.request, sys

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def api_get(path):
    req = urllib.request.Request(f"https://api.uumit.com{path}", headers={
        "X-Api-Key": key, "X-Platform-User-Id": uid
    })
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def api_post(path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers={
        "X-Api-Key": key, "X-Platform-User-Id": uid,
        "Content-Type": "application/json"
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": str(e), "body": e.read().decode() if e.fp else ""}

tx_id = "2a5719a6-4a36-43a6-b688-50321ed6fc96"
cap_id = "7e528635-2823-4b30-8355-9e97c1507831"

# 1. Get transaction detail
print("=== TRANSACTION DETAIL ===")
r = api_get(f"/api/v1/transactions/{tx_id}")
print(json.dumps(r, ensure_ascii=False)[:1000])

# 2. Get capability detail (MCP Server)
print("\n=== CAPABILITY DETAIL ===")
r = api_get(f"/api/v1/capabilities/{cap_id}")
print(json.dumps(r, ensure_ascii=False)[:1000])

# 3. Check what endpoints exist for accepting/acting on transactions
print("\n=== TRY ACCEPTANCE ENDPOINTS ===")
# Try various endpoints for accepting the transaction
endpoints = [
    f"/api/v1/transactions/{tx_id}/accept",
    f"/api/v1/transactions/{tx_id}/deliver",
    f"/api/v1/transactions/{tx_id}/confirm",
    f"/api/v1/transactions/{tx_id}/settle",
    f"/api/v1/transactions/{tx_id}/complete",
    f"/api/v1/transactions/{tx_id}/submit",
]
for ep in endpoints:
    r = api_post(ep)
    err = r.get("error","")
    print(f"  POST {ep}: {err[:80] if err else json.dumps(r, ensure_ascii=False)[:200]}")

# 4. Try GET versions too (to check if they exist)
print("\n=== TRY GET ENDPOINTS ===")
for ep in [f"/api/v1/transactions/{tx_id}/actions",
           f"/api/v1/transactions/{tx_id}/status"]:
    try:
        r = api_get(ep)
        print(f"  GET {ep}: {json.dumps(r, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"  GET {ep}: {str(e)[:80]}")

# 5. Check the MCP Server skill details
print("\n=== MCP SERVER SKILL ===")
skill_id = "543a7012-f97f-4675-9"
r = api_get(f"/api/v1/skills/{skill_id}")
print(json.dumps(r, ensure_ascii=False)[:1500])
