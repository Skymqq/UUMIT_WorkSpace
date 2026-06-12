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

def api_post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f"https://api.uumit.com{path}", data=body, headers={
        "X-Api-Key": key, "X-Platform-User-Id": uid,
        "Content-Type": "application/json"
    })
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

# 1. Check ALL orders with page_size=200 for a full picture
print("=== FULL ORDER SCAN ===")
all_orders = []
for pg in range(1, 6):
    try:
        r = api_get(f"/api/v1/orders?page={pg}&page_size=200")
        data = r.get("data",{})
        items = data.get("items",[]) if isinstance(data,dict) else []
        if not items: break
        all_orders.extend(items)
    except: break
print(f"Total orders across all pages: {len(all_orders)}")

# Find MCP-related and 阿星 orders
xing_uid = "65c2be88-f1f3-4cb7-b556-7d3758132877"
print(f"\n=== 阿星 (65c2be88...) orders ===")
for o in all_orders:
    bid = o.get("buyer_id","")
    if xing_uid in bid:
        title = o.get("title","") or o.get("task_title","")
        status = o.get("status","")
        oid = o.get("id","")
        print(f"  [{status}] {title[:50]} | {oid[:20]}")

# Find MCP-related orders (不管buyer)
print(f"\n=== MCP-related orders ===")
for o in all_orders:
    title = o.get("title","") or o.get("task_title","")
    if "MCP" in title.upper():
        bid = o.get("buyer_id","")
        status = o.get("status","")
        oid = o.get("id","")
        print(f"  [{status}] {title[:50]} | buyer={bid[:30]} | {oid[:20]}")

# 2. Check skills / assets / services 
print(f"\n=== MY SKILLS (published) ===")
r = api_get("/api/v1/skills?page=1&page_size=50")
print(json.dumps(r, ensure_ascii=False)[:3000])

# 3. Check assets
print(f"\n=== MY ASSETS ===")
r = api_get("/api/v1/assets?page=1&page_size=50")
print(json.dumps(r, ensure_ascii=False)[:3000])

# 4. Check if there's a "skill invocations" or "service calls" endpoint
print(f"\n=== TRYING SERVICE/SKILL CALL ENDPOINTS ===")
for ep in ["/api/v1/skills/calls", "/api/v1/skills/invocations", 
           "/api/v1/service-calls", "/api/v1/services/calls",
           "/api/v1/skill-orders", "/api/v1/skill-invocations"]:
    try:
        r = api_get(f"{ep}?page=1&page_size=20")
        print(f"  {ep}: {json.dumps(r, ensure_ascii=False)[:500]}")
    except Exception as e:
        print(f"  {ep}: {str(e)[:100]}")

# 5. Check tasks - find MCP related tasks
print(f"\n=== MY TASKS (MCP related) ===")
r = api_get("/api/v1/tasks?page=1&page_size=100")
data = r.get("data",{})
tasks = data.get("items",[]) if isinstance(data,dict) else []
for t in tasks:
    title = t.get("title","")
    if "MCP" in title.upper() or "定制" in title or "定制开发" in title:
        tid = t.get("id","")
        status = t.get("status","")
        print(f"  [{status}] {title[:50]} | {tid[:20]}")
