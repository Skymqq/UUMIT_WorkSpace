import json, sys, urllib.request, time, uuid, os

API_KEY = os.environ.get('UUMIT_KEY', '')
UID = os.environ.get('UUMIT_UID', '')
if not API_KEY or not UID:
    print("ERROR: Set UUMIT_KEY and UUMIT_UID env vars")
    sys.exit(1)

BASE = "https://api.uumit.com"

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}",
        headers={"X-Api-Key": API_KEY, "X-Platform-User-Id": UID})
    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode())

def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}",
        data=data,
        headers={
            "X-Api-Key": API_KEY,
            "X-Platform-User-Id": UID,
            "Content-Type": "application/json",
            "Idempotency-Key": f"apply-{uuid.uuid4().hex[:12]}"
        })
    return json.loads(urllib.request.urlopen(req, timeout=10).read().decode())

# Load skills and build index
skills_data = api_get("/api/v1/skills?page=1&page_size=50")
my_skills = {}
for s in skills_data.get("data", {}).get("items", []):
    my_skills[s["id"]] = {
        "name": s["name"],
        "price": float(s.get("ut_price", 0)),
        "category": s.get("category", "")
    }

# Keyword-based skill picker
SKILL_RULES = {
    "python": ["Python数据采集", "Python", "数据整理", "RPA"],
    "scraper": ["Python数据采集", "Python", "数据整理"],
    "data": ["数据整理", "数据分析", "AI数据分析"],
    "script": ["数据整理", "Python", "AI数据分析"],
    "word": ["文档排版"],
    "template": ["文档排版"],
    "copy": ["AI写作辅助", "文案润色", "电商产品文案"],
    "resume": ["简历优化"],
    "video_script": ["短视频脚本"],
    "ai": ["AI Prompt", "AI数据分析", "AI工作流", "AI Agent"],
    "hushua": ["互刷"],
    "guide": ["平台运营"],
    "academic": ["学术论文"],
}

CAT_SKILL_MAP = {
    "技术开发": ["python", "scraper", "script", "data", "ai"],
    "AI与自动化": ["ai", "python", "script"],
    "文案写作": ["copy", "video_script"],
    "设计服务": ["template", "word"],
    "人事行政": ["resume"],
    "营销推广": ["hushua", "guide"],
    "咨询顾问": ["guide", "copy"],
    "数据处理": ["data", "script"],
    "科研学术": ["academic", "copy"],
    "其他": ["hushua", "guide", "copy"],
    "电商运营": ["hushua", "copy"],
    "商务服务": ["guide"],
    "生活服务": ["hushua"],
}

def find_skill(category):
    kw_list = CAT_SKILL_MAP.get(category, ["hushua"])
    for kw_group in kw_list:
        trigger_names = SKILL_RULES.get(kw_group, [])
        for sid, s in my_skills.items():
            for trig in trigger_names:
                if trig in s["name"]:
                    return sid
    # Fallback: lowest price skill
    return min(my_skills.items(), key=lambda x: x[1]["price"])[0]

def make_msg(title, desc):
    t = (title + " " + desc).lower()
    if any(k in t for k in ["爬虫", "抓取", "数据采集"]):
        return "您好，我有丰富的Python爬虫开发经验，可以快速完成数据抓取任务，代码规范、注释完整。"
    if ("脚本" in t and "python" in t) or "实用脚本" in t:
        return "您好，我有丰富的Python脚本开发经验，可以快速交付高质量的脚本代码。"
    if "ocr" in t or ("图像" in t and "识别" in t):
        return "您好，我有图像处理和OCR开发经验，可以完成这个任务。"
    if "文案" in t or "朋友圈" in t:
        return "您好，我有文案写作经验，可以高质量完成。"
    if "简历" in t:
        return "您好，我有简历优化和面试辅导经验，可以帮助优化。"
    if "模板" in t or "word报告" in t:
        return "您好，我可以帮您制作专业的Word报告模板。"
    if "视频脚本" in t:
        return "您好，我有短视频脚本创作经验，可以快速完成。"
    if any(k in t for k in ["互", "返", "推广", "体验", "补贴", "关注"]):
        return "您好，申请合作，可以配合完成。"
    if "ai" in t or "量化" in t:
        return "您好，我有丰富的AI开发和应用经验，可以完成这个任务。"
    if "文献" in t:
        return "您好，我有学术文献整理经验，可以帮您完成。"
    if "codex" in t:
        return "您好，我熟悉Codex CLI的使用，可以整理最佳实践。"
    if "抖音" in t:
        return "您好，我可以完成数据收集和整理工作。"
    if any(k in t for k in ["副业", "经验", "避坑"]):
        return "您好，我有相关经验可以分享，保证内容真实有用。"
    if "工具" in t and "推荐" in t:
        return "您好，我熟悉各类效率工具和AI工具，可以推荐。"
    return "您好，我有相关经验，可以完成这个任务。"

print("=== 扫大厅批量申请 ===\n")

applied = 0
failed = 0
skipped_own = 0
already_done = 0

for page in range(1, 6):  # Scan 5 pages
    try:
        data = api_get(f"/api/v1/tasks/hall?page={page}&page_size=50")
        items = data.get("data", {}).get("items", [])
        if not items:
            break
        total = data.get("data", {}).get("total", 0)
        
        for t in items:
            if t.get("status") != "open":
                continue
            
            task_id = t["id"]
            poster = t.get("user_id", "")
            title = t.get("title", "")
            desc = t.get("description", "")
            bounty = t.get("bounty_amount", "0")
            category = t.get("category", "")
            my_app = t.get("my_application_status")
            
            if poster == UID:
                skipped_own += 1
                continue
            if my_app:
                already_done += 1
                continue
            
            skill_id = find_skill(category)
            try:
                proposed = str(float(bounty)) if bounty else str(my_skills[skill_id]["price"])
            except:
                proposed = str(my_skills[skill_id]["price"])
            
            msg = make_msg(title, desc)
            
            try:
                result = api_post(f"/api/v1/tasks/{task_id}/applications", {
                    "skill_id": skill_id,
                    "message": msg,
                    "proposed_price": proposed
                })
                if result.get("code") == 0:
                    applied += 1
                    print(f"  [+] +{bounty}UT | {title[:40]}")
                else:
                    failed += 1
                    err = result.get("message", "?")[:60]
                    print(f"  [x] {title[:30]} | {err}")
            except Exception as e:
                failed += 1
                print(f"  [!] {title[:25]} | {str(e)[:50]}")
            
            time.sleep(0.3)
        
        print(f"[第{page}页完成, 总数:{total}]")
        if page * 50 >= total:
            break
    except Exception as e:
        print(f"[第{page}页出错: {e}]")
        break

print(f"\n=== 完成: 成功={applied} 失败={failed} 跳过自己={skipped_own} 已申请={already_done} ===")
