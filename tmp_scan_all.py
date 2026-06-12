import json, sys, urllib.request

API_KEY = "Pci85xUdHRdsnZtI-IBnPcsvahxyZH19ihdEU4Pj5SIFHVOHThI1GTTaMSK8Ecu5"
UID = "67dd1391-253e-4e46-9f4d-a6494abf4cd5"

# Get all my skills
print("=== 我的技能 ===")
req = urllib.request.Request("https://api.uumit.com/api/v1/skills?page=1&page_size=50",
    headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
resp = urllib.request.urlopen(req, timeout=15)
skills_data = json.loads(resp.read().decode())
skills = skills_data.get("data", {}).get("items", [])
for s in skills:
    sid = s.get("id", "")[:12]
    name = s.get("name", "?")
    price = s.get("ut_price", "?")
    cat = s.get("category", "?")
    print(f"  {sid} | {price}UT | {cat} | {name}")

# Get open tasks with bounty amounts
print("\n=== 大厅Open任务(含赏金) ===")
all_open = []
for page in range(1, 11):
    url = f"https://api.uumit.com/api/v1/tasks/hall?page={page}&page_size=50"
    req = urllib.request.Request(url, headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        d = json.loads(resp.read().decode())
        items = d.get("data", {}).get("items", [])
        if not items:
            break
        total = d.get("data", {}).get("total", 0)
        for t in items:
            if t.get("status") == "open":
                all_open.append(t)
                uid = str(t.get("user_id", ""))[:12]
                tid = t.get("id", "")
                bounty = t.get("bounty_amount", "?")
                title = str(t.get("title", "无标题"))[:55]
                cat = t.get("category", "?")
                app_cnt = t.get("application_count", 0)
                desc = str(t.get("description", ""))[:80].replace("\n", " ")
                print(f"  {bounty}UT | {cat} | 申请:{app_cnt} | {title}")
                print(f"    用户:{uid} | {desc}")
        if page * 50 >= total:
            break
    except Exception as e:
        print(f"[第{page}页] 错误: {e}")
        break

print(f"\n=== 汇总: 共找到 {len(all_open)} 个open任务 ===")
