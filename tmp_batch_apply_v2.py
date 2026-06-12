"""Quick test - apply to open tasks"""
import json, sys, urllib.request, time, uuid

API_KEY = sys.argv[1]
UID = sys.argv[2]
BASE = "https://api.uumit.com"

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}",
        headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
    return json.loads(urllib.request.urlopen(req, timeout=8).read().decode())

def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data,
        headers={
            "X-Api-Key": API_KEY,
            "X-Platform-User-Id": UID,
            "Content-Type": "application/json",
            "Idempotency-Key": f"apply-{uuid.uuid4().hex[:12]}"
        })
    return json.loads(urllib.request.urlopen(req, timeout=8).read().decode())

print("Step 1: Loading skills...", flush=True)
sd = api_get("/api/v1/skills?page=1&page_size=50")
skills = {}
for s in sd.get("data", {}).get("items", []):
    skills[s["id"]] = s["name"]
print(f"  Got {len(skills)} skills", flush=True)

hushua_skill = python_skill = None
for sid, name in skills.items():
    if "互刷" in name:
        hushua_skill = sid
    if "Python数据采集" in name or "数据整理" in name:
        python_skill = sid
if not hushua_skill:
    hushua_skill = list(skills.keys())[0]
print(f"  hushua={hushua_skill[:12] if hushua_skill else 'N/A'}", flush=True)
print(f"  python={python_skill[:12] if python_skill else 'N/A'}", flush=True)

print("\nStep 2: Scanning hall...", flush=True)
candidates = []
for page in range(1, 4):
    data = api_get(f"/api/v1/tasks/hall?page={page}&page_size=50")
    items = data.get("data", {}).get("items", [])
    if not items:
        break
    total = data.get("data", {}).get("total", 0)
    for t in items:
        if t.get("status") == "open" and t.get("user_id") != UID and not t.get("my_application_status"):
            candidates.append(t)
    print(f"  Page {page}: {len(candidates)} candidates so far (total:{total})", flush=True)
    if page * 50 >= total:
        break

print(f"  Total candidates: {len(candidates)}", flush=True)

print(f"\nStep 3: Applying to {min(len(candidates), 20)} tasks...", flush=True)
applied = failed = 0
for t in candidates[:20]:
    title = t.get("title", "")
    desc = t.get("description", "")
    bounty = t.get("bounty_amount", "0")
    category = t.get("category", "")
    task_id = t["id"]
    
    skill = python_skill if category in ("技术开发", "AI与自动化", "数据处理") else hushua_skill
    
    try:
        proposed = str(float(bounty)) if bounty else "51"
    except:
        proposed = "51"
    
    if "爬虫" in title or "抓取" in title or "数据采集" in title or "采集" in desc:
        msg = "您好，我有丰富的Python爬虫开发经验，可以快速完成数据抓取任务。"
    elif "体验" in title or "推广" in title or "返" in title or "互" in title or "补贴" in title:
        msg = "您好，申请合作，可以配合完成。"
    elif "脚本" in title:
        msg = "您好，我有Python脚本开发经验，可以快速完成。"
    else:
        msg = "您好，我有相关经验，可以完成这个任务。"
    
    try:
        print(f"  [{applied+1}/{failed}] +{bounty}UT | {title[:35]}...", end=" ", flush=True)
        result = api_post(f"/api/v1/tasks/{task_id}/applications", {
            "skill_id": skill,
            "message": msg,
            "proposed_price": proposed
        })
        if result.get("code") == 0:
            print("OK")
            applied += 1
        else:
            print(f"FAIL: {result.get('message','?')[:40]}")
            failed += 1
    except Exception as e:
        print(f"ERR: {str(e)[:40]}")
        failed += 1
    
    time.sleep(0.3)

print(f"\n=== 结果: 成功={applied}, 失败={failed} ===")
