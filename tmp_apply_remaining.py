"""Apply to remaining open tasks (my_app=None)"""
import json, sys, urllib.request, time, uuid

UID = sys.argv[1]
API_KEY=*** = "https://api.uumit.com"

def api_post(path, body):
    data = json.dumps(body).encode()
    ik = f"apply2-{uuid.uuid4().hex[:12]}"
    req = urllib.request.Request(f"{BASE}{path}", data=data,
        headers={
            "X-Api-Key": API_KEY,
            "X-Platform-User-Id": UID,
            "Content-Type": "application/json",
            "Idempotency-Key": ik
        })
    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode())

# Get skills
req = urllib.request.Request(f"{BASE}/api/v1/skills?page=1&page_size=50",
    headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
skills_data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
skills = {}
for s in skills_data.get("data", {}).get("items", []):
    skills[s["id"]] = {"name": s["name"], "price": s.get("ut_price", "51")}

hushua_skill = python_skill = copy_skill = None
for sid, s in skills.items():
    if "互刷" in s["name"]:
        hushua_skill = sid
    if "Python数据采集" in s["name"]:
        python_skill = sid
    if "文案润色·去AI痕迹" in s["name"]:
        copy_skill = sid
if not copy_skill:
    for sid, s in skills.items():
        if "AI写作辅助" in s["name"]:
            copy_skill = sid
            break

print(f"Skills ready: hushua={hushua_skill[:12] if hushua_skill else 'N/A'}, python={python_skill[:12] if python_skill else 'N/A'}")

unapplied = []
for page in range(7, 11):
    req = urllib.request.Request(f"{BASE}/api/v1/tasks/hall?page={page}&page_size=50",
        headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
    d = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    items = d.get("data", {}).get("items", [])
    for t in items:
        if t.get("status") == "open" and t.get("user_id") != UID and t.get("my_application_status") is None:
            unapplied.append(t)
    print(f"  Page {page}: {len(unapplied)} total unapplied")

applied = failed = 0
for t in unapplied:
    title = t.get("title", "")
    desc = t.get("description", "")[:100]
    bounty = t.get("bounty_amount", "0")
    category = t.get("category", "")
    task_id = t["id"]
    
    skill = hushua_skill
    if category in ("技术开发", "AI与自动化", "数据处理"):
        skill = python_skill
    if not skill:
        skill = list(skills.keys())[0]
    
    try:
        proposed = str(float(bounty)) if bounty else "51"
    except:
        proposed = "51"
    
    text = (title + " " + desc).lower()
    if any(k in text for k in ["体验", "推广", "返", "互", "补贴", "关注", "试用"]):
        msg = "您好，申请合作，可以配合完成。"
    elif "踩坑" in text or "经验" in text:
        msg = "您好，我有相关经验可以分享。"
    elif "脚本" in title:
        msg = "您好，我有Python脚本开发经验，可以快速完成。"
    elif "数据" in title or "金融" in title:
        msg = "您好，我有数据处理经验，可以完成。"
    elif "标注" in title:
        msg = "您好，我可以做数据标注工作。"
    elif "语音" in title:
        msg = "您好，我可以参与。"
    else:
        msg = "您好，申请合作，可以完成。"
    
    try:
        result = api_post(f"/api/v1/tasks/{task_id}/applications", {
            "skill_id": skill,
            "message": msg,
            "proposed_price": proposed
        })
        if result.get("code") == 0:
            applied += 1
            print(f"  [+] +{bounty}UT | {title[:35]}")
        else:
            failed += 1
            print(f"  [x] {title[:20]} | {result.get('message','?')[:40]}")
    except Exception as e:
        failed += 1
        print(f"  [!] {title[:20]} | {str(e)[:40]}")
    time.sleep(0.5)

print(f"\nDone: success={applied}, failed={failed}")
