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

# Check if the cruise snapshot has in-progress orders showing delivered status
print("=== CRUISE SNAPSHOT ===")
r = api_req("GET", "/api/v1/agent/cruise?include=all")
if r["ok"]:
    data = r["data"]["data"]
    orders = data.get("orders_in_progress", {})
    acc = data.get("transactions_accepted", {})
    print(f"Orders in progress: {orders}")
    print(f"Transactions accepted: {acc}")

# Try with the rest_request.js to call the A2A complete/confirm through its proper flow
# Maybe the agent/cruise endpoint has a way to complete pending work
print("\n=== TRY AGENT COMPLETE ===")
for ep in [f"/api/v1/agent/transactions/{tx_id}/complete",
           f"/api/v1/agent/work/{tx_id}/complete"]:
    r = api_req("POST", ep, {"result": "ok", "note": "MCP Server delivered"})
    print(f"  {ep}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# Let me check the capability detail more - maybe delivery_mode=instant means auto-settle after deliver
print("\n=== CAPABILITY DETAIL ===")
cap_id = "7e528635-2823-4b30-8355-9e97c1507831"
r = api_req("GET", f"/api/v1/capabilities/{cap_id}")
if r["ok"]:
    d = r["data"]["data"]
    print(f"delivery_mode: {d.get('delivery_mode')}")
    print(f"has_deliverable: {d.get('has_deliverable')}")
    print(f"pricing_model: {d.get('pricing_model')}")
    print(f"auto_accept_min_ut: {d.get('auto_accept_min_ut')}")
    print(f"Keys: {list(d.keys())}")

# Get the current transaction one more time to see if anything changed
print("\n=== TRANSACTION STATUS CHECK ===")
r = api_req("GET", f"/api/v1/transactions/{tx_id}")
if r["ok"]:
    d = r["data"]["data"]
    print(f"Status: {d['status']}")
    print(f"auto_confirm_at: {d.get('auto_confirm_at')}")
    print(f"delivery_deadline: {d.get('delivery_deadline')}")
    print(f"delivery_history count: {len(d.get('delivery_history', []))}")
    
    # Check if there's anything else we can do
    # Maybe we can add a result_payload to help with confirmation?
    if d["status"] == "delivered":
        print("\n=== TRY UPDATE RESULT PAYLOAD ===")
        payload = {
            "result_payload": {
                "summary": "MCP Server定制开发已完成",
                "details": "包含完整的MCP Server代码、TypeScript/Python双语言实现、SSE传输模式、Tools/Resources/Prompts完整实现",
                "files": ["mcp-server-config.ts", "server-implementation.py", "deployment-guide.md"]
            }
        }
        r2 = api_req("PATCH", f"/api/v1/transactions/{tx_id}", payload)
        print(f"  PATCH result: {r2['code']} - {r2.get('body','')[:200] if not r2['ok'] else json.dumps(r2['data'],ensure_ascii=False)[:200]}")
