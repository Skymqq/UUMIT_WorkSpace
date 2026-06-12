#!/usr/bin/env python3
"""
扫大厅单 - 批量申请，避免互刷单
只申请真实开发任务（技术开发、AI与自动化、数据处理、文案写作、设计服务等）
跳过互刷任务（其他、营销推广、咨询顾问、电商运营）
"""
import json, os, sys, uuid, urllib.request

with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']

def api_get(path):
    req = urllib.request.Request(
        f'https://api.uumit.com{path}',
        headers={'X-Api-Key': KEY, 'X-Platform-User-Id': MYUID}
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def api_post(path, body):
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    idem_key = f'scan-{uuid.uuid4().hex[:12]}'
    req = urllib.request.Request(
        f'https://api.uumit.com{path}',
        data=data,
        headers={
            'X-Api-Key': KEY, 'X-Platform-User-Id': MYUID,
            'Content-Type': 'application/json',
            'Idempotency-Key': idem_key
        },
        method='POST'
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

# 真实技能ID（从之前的查询获取）
SKILL_MAP = {
    '技术开发': 'bc4784d5-0993-409a-a6fd-40eb5f7ac418',   # Python数据采集与RPA自动化 - 260UT
    'AI与自动化': 'c4aff1f7-6c5e-4cc1-a357-3a87c9007f77', # AI Prompt 工程化与Agent Skill开发 - 280UT
    '数据处理': 'b1c26339-4954-4c73-b7e6-ae315994d6e8',   # 数据清洗与ETL自动化服务 - 150UT
    '文案写作': '1e6ca4e2-de38-401a-8a56-8ada339ffddf',   # AI写作辅助与文案润色 - 80UT
    '设计服务': 'c3e3c780-582d-4694-8405-bb08e033132e',   # HTML+CSS 交互式网页工具开发 - 200UT
    '教育培训': '6fccb55a-1386-4cf2-a58c-553e0f31c062',   # AI学习助手与数字技能培训 - 120UT
    '人事行政': '61c299ba-66d8-460b-ae66-3228ad9174ba',   # 简历优化与面试辅导 - 100UT
    '科研学术': '2e130b2d-2423-4007-82b1-abc0fe863d0f',   # 科研数据分析与学术图表制作 - 180UT
    '翻译服务': '8c05a600-dc2e-45de-9533-13b86dcca999',   # 中英日多语言翻译与本地化 - 80UT
    '动漫绘画': '36f59976-cb26-41ee-bc3a-a76dd1fa794b',   # AI动漫角色与漫画分镜创作 - 150UT
}

# 互刷类别（跳过不申请）
HUSHUAN_CATEGORIES = {'其他', '营销推广', '咨询顾问', '电商运营'}

# 也跳过这些用户（自己的任务、已知互刷伙伴可接可不接，先跳过）
SKIP_USER_IDS = {MYUID}  # 跳过自己的任务

# === STEP 1: Scan hall ===
print("=== 扫大厅 ===")
print(f"跳过类别: {', '.join(sorted(HUSHUAN_CATEGORIES))}")
print()

all_open_unapplied = []
page = 1
total_scanned = 0

while page <= 20:  # Max 20 pages
    r = api_get(f'/api/v1/tasks/hall?page={page}&page_size=50')
    items = r.get('data', {}).get('items', [])
    total = r.get('data', {}).get('total', 0)
    if not items:
        break

    for t in items:
        total_scanned += 1
        status = t.get('status', '')
        my_app = t.get('my_application_status')
        user_id = t.get('user_id', '')
        category = t.get('category', '')
        title = t.get('title', '无标题')
        bounty = t.get('bounty_amount', '0')
        tid = t.get('id', '')[:12]

        # Skip if not open
        if status != 'open':
            continue
        # Skip if already applied
        if my_app is not None:
            continue
        # Skip own tasks
        if user_id in SKIP_USER_IDS:
            continue
        # Skip 互刷 categories
        if category in HUSHUAN_CATEGORIES:
            continue

        all_open_unapplied.append(t)

        skill_id = SKILL_MAP.get(category, None)
        has_skill = '✅' if skill_id else '❌无匹配技能'
        print(f"  [{tid}] {bounty:>5s}UT | {category:8s} | {has_skill:8s} | {title[:45]}")

    page += 1

print(f"\n扫描完成: 共扫描{total_scanned}条，找到 {len(all_open_unapplied)} 个可申请的非互刷任务")

# === STEP 2: Filter only tasks where we have a matching skill ===
apply_tasks = [t for t in all_open_unapplied if t.get('category', '') in SKILL_MAP]
print(f"其中有匹配技能的: {len(apply_tasks)} 个")

if not apply_tasks:
    print("✅ 没有可申请的非互刷任务")
    sys.exit(0)

# === STEP 3: Apply ===
print("\n=== 开始批量申请 ===")
success = 0
failed = 0
already = 0

for t in apply_tasks:
    task_id = t.get('id', '')
    title = t.get('title', '无标题')
    bounty = t.get('bounty_amount', '0')
    category = t.get('category', '其他')
    skill_id = SKILL_MAP.get(category)
    tid_short = task_id[:12]

    body = {
        'skill_id': skill_id,
        'message': f"申请接单，可完成此{category}任务。",
        'proposed_price': str(bounty)
    }

    try:
        resp = api_post(f'/api/v1/tasks/{task_id}/applications', body)
        if resp.get('code') == 0:
            print(f'  ✅ [{tid_short}] {bounty}UT | {title[:35]:35s} | 申请成功')
            success += 1
        elif resp.get('code') == 4001:
            print(f'  ⏳ [{tid_short}] {bounty}UT | {title[:35]:35s} | 已申请过')
            already += 1
        else:
            print(f'  ❌ [{tid_short}] {bounty}UT | {title[:35]:35s} | {resp.get("message","未知错误")}')
            failed += 1
    except Exception as e:
        print(f'  ❌ [{tid_short}] {bounty}UT | {title[:35]:35s} | {str(e)[:80]}')
        failed += 1

print(f"\n=== 申请完成 ===")
print(f"  成功: {success} | 已申请过: {already} | 失败: {failed}")
print(f"  总计申请: {success + already} 单")
