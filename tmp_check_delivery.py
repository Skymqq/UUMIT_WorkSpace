"""Check for pending_delivery orders"""
import json, sys, urllib.request

UID = sys.argv[1]
API_KEY=*** = "https://api.uumit.com"

req = urllib.request.Request(f"{BASE}/api/v1/orders?page=1&page_size=50",
    headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
d = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())

items = d.get("data", {}).get("items", [])
total = d.get("data", {}).get("total", 0)
print(f"Total orders: {total}, Page items: {len(items)}")

pending = []
status_counts = {}
for o in items:
    s = o.get("status", "?")
    status_counts[s] = status_counts.get(s, 0) + 1
    if s == "pending_delivery" and o.get("seller_id") == UID:
        pending.append(o)
        print(f"\n[待交付] {o['id']}")
        print(f"  任务: {o.get('task_id','')[:12]} | {o.get('settlement_amount','?')}UT | 买家:{o.get('buyer_id','')[:12]}")
        print(f"  标题: {o.get('task_title','')[:50]}")

print(f"\n订单状态统计:")
for s, c in sorted(status_counts.items()):
    print(f"  {s}: {c}")
print(f"\n待交付(我需要交的): {len(pending)}")
