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
        return {"ok": False, "code": e.code, "body": e.read().decode()[:1000] if e.fp else str(e)}

tx_id = "2a5719a6-4a36-43a6-b688-50321ed6fc96"

# 1. Check current status after accept
print("=== STATUS AFTER ACCEPT ===")
r = api_req("GET", f"/api/v1/transactions/{tx_id}")
if r["ok"]:
    d = r["data"]["data"]
    print(f"Status: {d['status']}")
    print(f"Accepted at: {d.get('accepted_at')}")
    print(f"Delivered at: {d.get('delivered_at')}")
    print(f"Delivery deadline: {d.get('delivery_deadline')}")
else:
    print(f"Error: {r}")

# 2. Try to deliver (submit deliverables)
print("\n=== TRY DELIVER ===")
# The capability has delivery_mode="instant" and has_deliverable=false
# So maybe delivery is just a confirmation
for body in [{}, {"deliverable": "MCP Server development completed", "result": "done"},
             {"result_payload": "MCP Server定制开发已完成，包含完整的MCP Server代码、配置文件和使用文档。"}]:
    r = api_req("POST", f"/api/v1/transactions/{tx_id}/deliver", body)
    print(f"  POST deliver {json.dumps(body)[:80]}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# 3. Maybe there's a different deliver endpoint
print("\n=== TRY ALTERNATIVE DELIVER ENDPOINTS ===")
for ep, body in [
    (f"/api/v1/transactions/{tx_id}/submit", {"note": "MCP Server delivered"}),
    (f"/api/v1/transactions/{tx_id}/complete", {"result": "done"}),
    (f"/api/v1/transactions/{tx_id}/finish", {}),
]:
    r = api_req("POST", ep, body)
    print(f"  POST {ep}: {r['code']} - {r.get('body','')[:200] if not r['ok'] else json.dumps(r['data'],ensure_ascii=False)[:200]}")

# 4. Check status
print("\n=== FINAL STATUS ===")
r = api_req("GET", f"/api/v1/transactions/{tx_id}")
if r["ok"]:
    d = r["data"]["data"]
    print(f"Status: {d['status']}")
    print(f"accepted_at={d.get('accepted_at')}")
    print(f"delivered_at={d.get('delivered_at')}")
    print(f"confirmed_at={d.get('confirmed_at')}")
    print(f"settled_at={d.get('settled_at')}")
