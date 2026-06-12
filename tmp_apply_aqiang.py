#!/usr/bin/env python3
"""
批量申请阿强发布的所有开放任务
阿强 user_id: 4e3941ba-22be-406a-8575-d9cb8a13eb87
"""
import json, os, subprocess, sys

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

# Skill ID mapping by category
SKILL_MAP = {
    '技术开发': '460bf8da-14f9-47c6-abb9-f3613d8b1059',  # Python数据采集与RPA自动化 - 260UT
    'AI与自动化': '460bf8da-14f9-47c6-abb9-f3613d8b1059',
    '数据处理': '460bf8da-14f9-47c6-abb9-f3613d8b1059',
    '文案写作': 'ad886168-e6aa-4a58-95c0-1ddbd3de8ce3',  # AI写作辅助与文案润色 - 80UT
    '设计服务': '4f5c6a30-a8f3-4bae-bc53-491b705d0186',  # 文档排版与格式美化服务 - 50UT
    '人事行政': '7bb4a9c9-9e63-49cd-83e1-a6aadc7f116b',  # 简历优化与面试辅导 - 100UT
    '营销推广': '2a1b1a47-1c9a-4676-9663-d3f71fdc1874',  # 【互刷】知识产品互惠协助 - 125UT
    '咨询顾问': '2a1b1a47-1c9a-4676-9663-d3f71fdc1874',
    '其他': '2a1b1a47-1c9a-4676-9663-d3f71fdc1874',
    '电商运营': '2a1b1a47-1c9a-4676-9663-d3f71fdc1874',
    '科研学术': 'ad886168-e6aa-4a58-95c0-1ddbd3de8ce3',  # AI写作辅助与文案润色
}

def apply_task(task_id, title, bounty, category, msg=None):
    """Apply to a task via curl --data-binary (safe for Chinese text)."""
    skill_id = SKILL_MAP.get(category, '2a1b1a47-1c9a-4676-9663-d3f71fdc1874')
    if not msg:
        msg = f"申请接单，可以完成此任务。"

    body = json.dumps({
        'skill_id': skill_id,
        'message': msg,
        'proposed_price': bounty
    }, ensure_ascii=False)

    import uuid
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
        print(f'  ✅ {bounty}UT | {title[:30]} | 申请成功')
    elif resp.get('code') == 4001:
        print(f'  ⏳ {bounty}UT | {title[:30]} | 已经申请过')
    else:
        print(f'  ❌ {bounty}UT | {title[:30]} | {resp.get("message", "未知错误")}')


# === STEP 1: Scan all pages of the task hall for 阿强的 tasks ===
print("=== 扫描大厅，寻找阿强发布的任务 ===")
print(f"阿强 user_id: {AQIANG_ID}")
print(f"我的 user_id: {MYUID}")
print()

all_aqiang_tasks = []

for page in range(1, 6):  # Scan up to 5 pages
    r = curl_get(f'/api/v1/tasks/hall?page={page}&page_size=50')
    items = r.get('data', {}).get('items', [])
    if not items:
        print(f"  第{page}页: 无数据")
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
            print(f"  找到: {bounty}UT | {status} | 申请:{my_app} | {category} | {title[:40]}")

    print(f"  第{page}页完成 (共{len(items)}条)")

print(f"\n阿强总共发布了 {len(all_aqiang_tasks)} 个任务")

# === STEP 2: Filter open tasks that I haven't applied to ===
open_tasks = [t for t in all_aqiang_tasks
              if t.get('status') == 'open'
              and t.get('my_application_status') is None]

print(f"其中开放且未申请的任务: {len(open_tasks)} 个")
print()

if not open_tasks:
    print("✅ 阿强的所有开放任务都已经申请过了，或没有开放任务。")
    sys.exit(0)

# === STEP 3: Apply to each open task ===
print("=== 开始批量申请 ===")
for t in open_tasks:
    task_id = t.get('id', '')
    title = t.get('title', '无标题')
    bounty = t.get('bounty_amount', '0')
    category = t.get('category', '其他')
    apply_task(task_id, title, bounty, category)

print()
print("=== 申请完成! ===")

# === STEP 4: Verify my applications ===
print("\n=== 验证：查看我的申请状态 ===")
r = curl_get('/api/v1/tasks/applications/mine?page=1&page_size=50')
apps = r.get('data', {}).get('items', [])
if apps:
    for a in apps:
        status = a.get('status', '?')
        title = a.get('task_title', '')[:35]
        bounty = a.get('task', {}).get('bounty_amount', '?')
        user_id = a.get('task', {}).get('user_id', '')

        # Only show 阿强's tasks
        aqiang_task_ids = {t['id'][:12] for t in all_aqiang_tasks}
        tid = a.get('task_id', '')[:12]
        if tid in aqiang_task_ids or user_id == AQIANG_ID:
            owner = a.get('task', {}).get('user_nickname', '?')
            print(f"  {status:10} | {bounty:>5}UT | {owner:6s} | {title}")
else:
    print("  无申请记录")
