import json, urllib.request, sys

with open("/home/muqiqiang/.hermes/skills/uumit-agent/memory/uumit-auth.json") as f:
    auth = json.load(f)
key = auth["cached_api_key"]
uid = auth["cached_user_id"]

def api_get(path):
    req = urllib.request.Request(f"https://api.uumit.com{path}", headers={
        "X-Api-Key": key, "X-Platform-User-Id": uid
    })
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

# 1. Get all skills (published) - check all pages
print("=== ALL MY SKILLS ===")
all_skills = []
for pg in [1,2,3]:
    r = api_get(f"/api/v1/skills?page={pg}&page_size=50")
    data = r.get("data", {})
    items = data.get("items", []) if isinstance(data, dict) else []
    if not items: break
    all_skills.extend(items)
for s in all_skills:
    name = s.get("name","")
    price = s.get("ut_price","")
    sid = s.get("id","")
    status = s.get("status","")
    print(f"  [{status}] {name} | {price}UT | {sid[:20]}")

# 2. Find skill orders - check different endpoints for skill/service orders
print("\n=== SKILL ORDERS ===")
found_any = False
for ep in ["/api/v1/skills/orders", "/api/v1/service-orders", 
           "/api/v1/skill-orders", "/api/v1/orders/skill"]:
    try:
        r = api_get(f"{ep}?page=1&page_size=50")
        found_any = True
        print(f"  {ep}: code={r.get('code')}, data={json.dumps(r.get('data',{}), ensure_ascii=False)[:1000]}")
    except Exception as e:
        print(f"  {ep}: {str(e)[:100]}")

if not found_any:
    # Try looking for a different way - check if skills have an "orders" sub-resource
    for s in all_skills:
        sid = s.get("id","")
        try:
            r = api_get(f"/api/v1/skills/{sid}/orders?page=1&page_size=50")
            oitems = r.get("data",{}).get("items",[])
            if oitems:
                for o in oitems:
                    print(f"  Skill={s.get('name')}: order {json.dumps(o, ensure_ascii=False)[:200]}")
        except:
            pass

# 3. Also check if there's a "skill calls" or "invocations" concept  
print("\n=== SKILL CALLS / INVOCATIONS ===")
for ep in ["/api/v1/skills/calls", "/api/v1/skill-calls",
           "/api/v1/skills/invocations", "/api/v1/skill-invocations",
           "/api/v1/services/calls", "/api/v1/service-calls"]:
    try:
        r = api_get(f"{ep}?page=1&page_size=50")
        print(f"  {ep}: {json.dumps(r, ensure_ascii=False)[:500]}")
    except:
        pass

# 4. Check wallet/trading records to see if there are incoming 400UT payments
print("\n=== WALLET / TRANSACTIONS ===")
for ep in ["/api/v1/wallet/transactions", "/api/v1/transactions",
           "/api/v1/wallet/orders", "/api/v1/finance/records"]:
    try:
        r = api_get(f"{ep}?page=1&page_size=20")
        print(f"  {ep}: {json.dumps(r, ensure_ascii=False)[:1000]}")
    except:
        pass

# 5. Check my published "assets" or "services" marketplace items
# Maybe MCP Server service is published as a different type
print("\n=== USER SERVICES / PRODUCTS ===")
for ep in ["/api/v1/services", "/api/v1/products", "/api/v1/marketplace/items"]:
    try:
        r = api_get(f"{ep}?page=1&page_size=50")
        print(f"  {ep}: {json.dumps(r, ensure_ascii=False)[:1000]}")
    except:
        pass
