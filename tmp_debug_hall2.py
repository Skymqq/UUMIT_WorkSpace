"""Debug: find open tasks in hall"""
import json, sys, urllib.request

UID = sys.argv[1]
API_KEY = sys.argv[2]
BASE = "https://api.uumit.com"

open_tasks = []
for page in range(1, 21):
    req = urllib.request.Request(f"{BASE}/api/v1/tasks/hall?page={page}&page_size=50",
        headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
    resp = urllib.request.urlopen(req, timeout=10)
    d = json.loads(resp.read().decode())
    items = d.get("data", {}).get("items", [])
    total = d.get("data", {}).get("total", 0)
    if not items:
        print(f"Page {page}: EMPTY - stopping")
        break
    
    for t in items:
        if t.get("status") == "open":
            open_tasks.append(t)
    
    cnt = sum(1 for t in items if t.get("status") == "open")
    print(f"Page {page}: {len(items)} items, {cnt} open (total={total})")
    
    if page * 50 >= total:
        print(f"Reached end (total={total})")
        break

print(f"\nTotal open tasks found: {len(open_tasks)}")
for t in open_tasks[:15]:
    uid = t.get("user_id", "")[:12]
    myapp = t.get("my_application_status")
    bounty = t.get("bounty_amount", "?")
    cat = t.get("category", "?")
    title = t.get("title", "")[:45]
    print(f"  user={uid} | {bounty}UT | {cat} | my_app={myapp} | {title}")
