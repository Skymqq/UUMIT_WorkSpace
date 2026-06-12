#!/usr/bin/env python3
"""
批量申请阿强发布的所有开放任务 - v3
使用 urllib.request 代替 curl subprocess 避免编码问题
"""
import json, os, sys, uuid
import urllib.request

# Load credentials
with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']
AQIANG_ID = "4e3941ba-22be-406a-8575-d9cb8a13eb87"

def api_get(path):
    req = urllib.request.Request(
        f'https://api.uumit.com{path}',
        headers={'X-Api-Key': KEY, 'X-Platform-User-Id': MYUID}
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def api_post(path, body):
    data = json.dumps(body, ensure_ascii=False).encode('utf-8')
    idem_key = f'apply-{uuid.uuid4().hex[:12]}'
    req = urllib.request.Request(
        f'https://api.uumit.com{path}',
        data=data,
        headers={
            'X-Api-Key': KEY,
            'X-Platform-User-Id': MYUID,
            'Content-Type': 'application/json',
            'Idempotency-Key': idem_key
        },
        method='POST'
    )
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

# Correct skill IDs from user's skills
SKILL_MAP = {
    '技术开发': 'bc4784d5-0993-409a-a6fd-40eb5f7ac418',   # Python数据采集与RPA自动化
    'AI与自动化': 'c4aff1f7-6c5e-4cc1-a357-3a87c9007f77', # AI Prompt 工程化与Agent Skill开发
    '数据处理': 'b1c26339-4954-4c73-b7e6-ae315994d6e8',   # 数据清洗与ETL自动化服务
    '文案写作': '1e6ca4e2-de38-401a-8a56-8ada339ffddf',   # AI写作辅助与文案润色
    '设计服务': 'c3e3c780-582d-4694-8405-bb08e033132e',   # HTML+CSS 交互式网页工具开发
    '其他': '2a1b1a47-47f1-44f0-bdf0-b26c99972d85',      # 【互刷】知识产品互惠协助
    '营销推广': '12b27cb4-007c-412b-9eb1-4d81a6c0f37c',  # 平台运营攻略与避坑指南
    '咨询顾问': '89ae87e7-9d52-4b92-addb-5ede931dbfcb',   # 平台运营规则解读与合规策略
    '电商运营': '59be0fb7-e5e2-489d-8dba-34b617527494',   # 电商运营数据分析与优化
    '教育培训': '6fccb55a-1386-4cf2-a58c-553e0f31c062',   # AI学习助手与数字技能培训
    '人事行政': '61c299ba-66d8-460b-ae66-3228ad9174ba',   # 简历优化与面试辅导
    '科研学术': '2e130b2d-2423-4007-82b1-abc0fe863d0f',   # 科研数据分析与学术图表制作
    '翻译服务': '8c05a600-dc2e-45de-9533-13b86dcca999',   # 中英日多语言翻译与本地化
    '动漫绘画': '36f59976-cb26-41ee-bc3a-a76dd1fa794b',   # AI动漫角色与漫画分镜创作
    '默认': '2a1b1a47-47f1-44f0-bdf0-b26c99972d85',      # 默认：互刷
}

# === STEP 1: Scan hall ===
print("=== 扫描大厅，寻找阿强发布的任务 ===")
print(f"阿强 user_id: {AQIANG_ID}")
print()

all_aqiang_tasks = []

for page in range(1, 6):
    r = api_get(f'/api/v1/tasks/hall?page={page}&page_size=50')
    items = r.get('data', {}).get('items', [])
    if not items:
        break
    for t in items:
        uid = t.get('user_id', '')
        if uid == AQIANG_ID:
            all_aqiang_tasks.append(t)
            my_app = t.get('my_application_status', None)
            status = t.get('status', '?')
            bounty = t.get('bounty_amount', '?')
            title = t.get('title', '无标题')[:40]
            cat = t.get('category', '其他')
            tid = t.get('id', '')[:12]
            print(f"  [{tid}] {bounty:>5s}UT | {status:10s} | 申请:{str(my_app):8s} | {cat:8s} | {title}")

print(f"\n阿强总共发布了 {len(all_aqiang_tasks)} 个任务")

# Filter open + not applied
open_tasks = [t for t in all_aqiang_tasks
              if t.get('status') == 'open'
              and t.get('my_application_status') is None]

print(f"其中开放且未申请的任务: {len(open_tasks)} 个")

if not open_tasks:
    print("✅ 阿强的所有开放任务都已经申请过或没有开放任务了。")
    sys.exit(0)

# === STEP 2: Apply ===
print("\n=== 开始批量申请 ===")
for t in open_tasks:
    task_id = t.get('id', '')
    title = t.get('title', '无标题')
    bounty = t.get('bounty_amount', '0')
    category = t.get('category', '其他')
    skill_id = SKILL_MAP.get(category, SKILL_MAP['默认'])
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
        elif resp.get('code') == 4001:
            print(f'  ⏳ [{tid_short}] {bounty}UT | {title[:35]:35s} | 已经申请过')
        else:
            print(f'  ❌ [{tid_short}] {bounty}UT | {title[:35]:35s} | {resp.get("message", "未知错误")}')
    except Exception as e:
        print(f'  ❌ [{tid_short}] {bounty}UT | {title[:35]:35s} | {str(e)[:80]}')

print("\n=== 申请完成! ===")

# === STEP 3: Verify ===
print("\n=== 验证：对阿强任务的申请状态 ===")
r = api_get('/api/v1/tasks/applications/mine?page=1&page_size=50')
apps = r.get('data', {}).get('items', [])
aqiang_tids = set()
for t in all_aqiang_tasks:
    aqiang_tids.add(t['id'])

count = 0
for a in apps:
    tid = a.get('task_id', '')
    if tid in aqiang_tids:
        count += 1
        status = a.get('status', '?')
        title = a.get('task_title', '')[:35]
        bounty = a.get('task', {}).get('bounty_amount', '?')
        print(f"  {status:10s} | {bounty:>5s}UT | {title}")

if count == 0:
    print("  (未找到阿强任务的申请记录)")
else:
    print(f"\n共 {count} 条阿强任务的申请记录")
