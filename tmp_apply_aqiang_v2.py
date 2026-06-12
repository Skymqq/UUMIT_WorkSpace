#!/usr/bin/env python3
"""
批量申请阿强发布的所有开放任务 - v2
阿强 user_id: 4e3941ba-22be-406a-8575-d9cb8a13eb87
使用真实的技能ID
"""
import json, os, subprocess, sys, uuid

# Load credentials
with open(os.environ['HOME'] + '/.hermes/skills/uumit-agent/memory/uumit-auth.json') as f:
    auth = json.load(f)
KEY = auth['cached_api_key']
MYUID = auth['cached_user_id']

AQIANG_ID = "4e3941ba-22be-406a-8575-d9cb8a13eb87"

def curl_get(path):
    cmd = ['curl', '-s', '--max-time', '15',
        '-H', f'X-Api-Key: {KEY}',
        '-H', f'X-Platform-User-Id: {MYUID}',
        f'https://api.uumit.com{path}']
    r = subprocess.run(cmd, capture_output=True, timeout=20)
    return json.loads(r.stdout)

# Correct skill IDs from the user's actual skills
SKILL_MAP = {
    '技术开发': 'bc4784d5-0993-409a-a6fd-40eb5f7ac418',  # Python数据采集与RPA自动化 - 260UT
    'AI与自动化': 'c4aff1f7-6c5e-4cc1-a357-3a87c9007f77',  # AI Prompt 工程化与Agent Skill开发 - 280UT
    '数据处理': 'b1c26339-4954-4c73-b7e6-ae315994d6e8',  # 数据清洗与ETL自动化服务 - 150UT
    '文案写作': '1e6ca4e2-de38-401a-8a56-8ada339ffddf',  # AI写作辅助与文案润色 - 80UT
    '设计服务': 'c3e3c780-582d-4694-8405-bb08e033132e',  # HTML+CSS 交互式网页工具开发 - 200UT
    '其他': '2a1b1a47-47f1-44f0-bdf0-b26c99972d85',  # 【互刷】知识产品互惠协助 - 125UT
    '营销推广': '12b27cb4-007c-412b-9eb1-4d81a6c0f37c',  # 平台运营攻略与避坑指南 - 80UT
    '咨询顾问': '89ae87e7-9d52-4b92-addb-5ede931dbfcb',  # 平台运营规则解读与合规策略 - 80UT
    '电商运营': '59be0fb7-e5e2-489d-8dba-34b617527494',  # 电商运营数据分析与优化 - 130UT
    '教育培训': '6fccb55a-1386-4cf2-a58c-553e0f31c062',  # AI学习助手与数字技能培训 - 120UT
    '人事行政': '61c299ba-66d8-460b-ae66-3228ad9174ba',  # 简历优化与面试辅导 - 100UT
    '科研学术': '2e130b2d-2423-4007-82b1-abc0fe863d0f',  # 科研数据分析与学术图表制作 - 180UT
    '翻译服务': '8c05a600-dc2e-45de-9533-13b86dcca999',  # 中英日多语言翻译与本地化 - 80UT
    '动漫绘画': '36f59976-cb26-41ee-bc3a-a76dd1fa794b',  # AI动漫角色与漫画分镜创作 - 150UT
}

def apply_task(task_id, title, bounty, category, msg=None):
    """Apply to a task via curl --data-binary (safe for Chinese text)."""
    skill_id = SKILL_MAP.get(category, '2a1b1a47-47f1-44f0-bdf0-b26c99972d85')
    if not msg:
        msg = f"申请接单，可以完成此{category}任务。"

    body = json.dumps({
        'skill_id': skill_id,
        'message': msg,
        'proposed_price': bounty
    }, ensure_ascii=False)

    idem_key = f'apply-aqiang-{task_id[:8]}-{uuid.uuid4().hex[:6]}'

    cmd = [
        'curl', '-s', '--max-time', '15', '-X', 'POST',
        '-H', f'X-Api-Key: {KEY}',
        '-H', f'X-Platform-User-Id: {MYUID}',
        '-H', 'Content-Type: application/json',
        '-H', f'Idempotency-Key: {idem_key}',
        '--data-binary', body.encode('utf-8'),
        f'https://api.uumit.com/api/v1/tasks/{task_id}/applications'
    ]

    result = subprocess.run(cmd, capture_output=True, timeout=20)
    resp = json.loads(result.stdout.decode('utf-8'))

    if resp.get('code') == 0:
        print(f'  ✅ {bounty}UT | {title[:35]:35s} | 申请成功')
    elif resp.get('code') == 4001:
        print(f'  ⏳ {bounty}UT | {title[:35]:35s} | 已经申请过')
    else:
        print(f'  ❌ {bounty}UT | {title[:35]:35s} | {resp.get("message", "未知错误")}')


# === STEP 1: Scan hall for 阿强's open tasks ===
print("=== 扫描大厅，寻找阿强发布的任务 ===")
print(f"阿强 user_id: {AQIANG_ID}")
print()

all_aqiang_tasks = []

for page in range(1, 6):
    r = curl_get(f'/api/v1/tasks/hall?page={page}&page_size=50')
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
            title = t.get('title', '无标题')
            category = t.get('category', '其他')
            print(f"  {bounty:>5s}UT | {status:10s} | 申请:{str(my_app):8s} | {category:8s} | {title[:40]}")

print(f"\n阿强总共发布了 {len(all_aqiang_tasks)} 个任务")

# Filter: open + not yet applied
open_tasks = [t for t in all_aqiang_tasks
              if t.get('status') == 'open'
              and t.get('my_application_status') is None]

print(f"其中开放且未申请的任务: {len(open_tasks)} 个")

if not open_tasks:
    print("✅ 阿强的所有开放任务都已经申请过或没有开放任务了。")
    sys.exit(0)

# === STEP 2: Apply ===
print("\n=== 开始批量申请 ===")
results = []
for t in open_tasks:
    task_id = t.get('id', '')
    title = t.get('title', '无标题')
    bounty = t.get('bounty_amount', '0')
    category = t.get('category', '其他')
    apply_task(task_id, title, bounty, category)

print("\n=== 申请完成! ===")

# === STEP 3: Verify ===
print("\n=== 验证：我的申请状态 ===")
r = curl_get('/api/v1/tasks/applications/mine?page=1&page_size=50')
apps = r.get('data', {}).get('items', [])
aqiang_task_ids = set()
for t in all_aqiang_tasks:
    aqiang_task_ids.add(t['id'][:20])

count = 0
for a in apps:
    tid = a.get('task_id', '')
    # Check if it matches any of 阿强's tasks
    is_aqiang = any(tid.startswith(prefix) for prefix in aqiang_task_ids)
    if is_aqiang:
        count += 1
        status = a.get('status', '?')
        title = a.get('task_title', '')[:35]
        bounty = a.get('task', {}).get('bounty_amount', '?')
        print(f"  {status:10s} | {bounty:>5s}UT | {title}")

if count == 0:
    print("  (未找到阿强任务的申请记录)")
