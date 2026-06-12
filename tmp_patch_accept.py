import json, urllib.request

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def api_req(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    headers = {"X-Api-Key": key, "X-Platform-User-Id": uid}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return {"ok": True, "code": resp.status, "data": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "code": e.code, "body": e.read().decode()[:500] if e.fp else str(e)}

tx_id = "2a5719a6-4a36-43a6-b688-50321ed6fc96"

# Try PATCH
print("=== TRY PATCH ===")
r = api_req("PATCH", f"/api/v1/transactions/{tx_id}/accept", {"status": "accepted"})
print(f"  PATCH accept: {json.dumps(r, ensure_ascii=False)[:200]}")

# Try with different body/payload formats
for body in [{}, {"accepted": True}, {"status": "accepted"}, {"action": "accept"}]:
    r = api_req("POST", f"/api/v1/transactions/{tx_id}/accept", body)
    print(f"  POST accept {body}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# Maybe the endpoint is different - check the capability's call endpoint
print("\n=== TRY CAPABILITY CALL ENDPOINTS ===")
cap_id = "7e528635-2823-4b30-8355-9e97c1507831"
for ep in [f"/api/v1/capabilities/{cap_id}/calls",
           f"/api/v1/capabilities/{cap_id}/calls/incoming",
           f"/api/v1/capabilities/{cap_id}/accept",
           f"/api/v1/capabilities/{cap_id}/deliver"]:
    r = api_req("GET", ep)
    print(f"  GET {ep}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# Check the Capabilities Incoming/inbox
print("\n=== CAPABILITY INCOMING CALLS ===")
r = api_req("GET", "/api/v1/capabilities/calls?status=pending&as=seller")
print(f"  GET capabilities/calls: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:500]}")

# Check if there's a /api/v1/capabilities/calls endpoint
for ep in ["/api/v1/capabilities/calls", "/api/v1/capabilities/calls/incoming",
           "/api/v1/capability-calls", "/api/v1/capability-calls/incoming"]:
    r = api_req("GET", f"{ep}?page=1&page_size=20")
    print(f"  {ep}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:300]}")
